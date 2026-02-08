import * as vscode from "vscode";
import * as path from "path";
import { SkillsTreeDataProvider } from "./skillsTreeProvider";
import { SkillWebviewProvider } from "./skillWebviewProvider";
import { SkillSearchProvider } from "./skillSearchProvider";
import { SkillManager } from "./skillManager";

export async function activate(context: vscode.ExtensionContext) {
  console.log("iFlow Extension is now active!");

  const skillManager = new SkillManager(context);
  const skillsTreeDataProvider = new SkillsTreeDataProvider(skillManager);
  const skillWebviewProvider = new SkillWebviewProvider(
    context.extensionUri,
    skillManager,
  );
  const skillSearchProvider = new SkillSearchProvider(
    context.extensionUri,
    skillManager,
  );

  // 设置技能变更回调，当保存技能时刷新树
  skillWebviewProvider.setOnSkillChanged(() => {
    skillsTreeDataProvider.refresh();
  });

  // 初始化时检查所有skill的同步状态
  const skills = skillManager.getAllSkills();
  for (const skill of skills) {
    await skillManager.checkGlobalSkillSyncStatus(skill.id);
  }
  skillsTreeDataProvider.refresh();

  // Register tree view
  const treeView = vscode.window.createTreeView("iflowSkillsView", {
    treeDataProvider: skillsTreeDataProvider,
    showCollapseAll: true,
  });

  // Track open detail panels by skill ID
  const openDetailPanels = new Map<string, vscode.WebviewPanel>();

  // Handle double-click on skill items to show details
  treeView.onDidChangeSelection(async (e) => {
    if (e.selection.length === 1 && e.selection[0].contextValue === "skill") {
      const skillItem = e.selection[0];
      if (skillItem.id) {
        // 保存 skillId 以避免 TypeScript 类型错误
        const skillId = skillItem.id;
        // 从文件中读取最新的 skill 内容
        const skill = await skillManager.readSkillFromFile(skillId);
        if (skill) {
          // 检查是否已有打开的详情页面
          const existingPanel = openDetailPanels.get(skillId);
          if (existingPanel) {
            // 如果已打开，直接显示该页面
            existingPanel.reveal(
              existingPanel.viewColumn || vscode.ViewColumn.One,
            );
            return;
          }

          // 显示技能详情
          const statusLabels: Record<string, string> = {
            synced: "已同步",
            modified: "已修改",
            outdated: "待更新",
            new: "新建",
          };

          const detailPanel = vscode.window.createWebviewPanel(
            "iflowSkillDetail",
            `Skill Details: ${skill.name}`,
            vscode.ViewColumn.One,
            {
              enableScripts: true,
              retainContextWhenHidden: true,
            },
          );

          // 保存到已打开面板Map中
          openDetailPanels.set(skillId, detailPanel);

          // 当面板关闭时，从Map中移除
          detailPanel.onDidDispose(() => {
            openDetailPanels.delete(skillId);
          });

          detailPanel.webview.html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skill Details: ${skill.name}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
            width: 100%;
            box-sizing: border-box;
            line-height: 1.6;
        }
        html {
            width: 100%;
            margin: 0;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 20px;
        }

        .header-left {
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex: 1;
            min-width: 0;
        }

        .title {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-foreground);
            margin: 0;
        }

        .skill-path {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
        }

        .button-group {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-shrink: 0;
        }

        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: background-color 0.2s;
            white-space: nowrap;
        }

        .btn-primary {
            background-color: var(--vscode-button-primaryBackground);
            color: var(--vscode-button-primaryForeground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-primaryHoverBackground);
        }

        .btn-success {
            background-color: #4ec9b0;
            color: #1e1e1e;
        }

        .btn-success:hover {
            background-color: #3db892;
        }

        h2 {
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0 10px 0;
            color: var(--vscode-textLink-foreground);
        }
        .detail-row {
            display: flex;
            margin: 8px 0;
        }
        .detail-label {
            font-weight: 600;
            min-width: 120px;
            color: var(--vscode-descriptionForeground);
        }
        .detail-value {
            flex: 1;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-synced { background-color: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
        .status-modified { background-color: rgba(220, 220, 170, 0.2); color: #dcdcaa; }
        .status-outdated { background-color: rgba(206, 145, 120, 0.2); color: #ce9178; }
        .status-new { background-color: rgba(86, 156, 214, 0.2); color: #569cd6; }
        .content-preview {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 20px;
            border-radius: 4px;
            margin: 20px 0;
            max-height: 70vh;
            overflow-y: auto;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 1.6;
            border: 1px solid var(--vscode-panel-border);
        }
        .content-preview h1, .content-preview h2, .content-preview h3 {
            margin-top: 20px;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .content-preview h1 {
            font-size: 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .content-preview h2 {
            font-size: 20px;
        }
        .content-preview h3 {
            font-size: 16px;
        }
        .content-preview code {
            background-color: rgba(255,255,255,0.1);
            padding: 2px 6px;
            border-radius: 3px;
        }
        .content-preview pre {
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <div class="title">${skill.name}</div>
            <div class="skill-path">${skill.absolutePath || "未知路径"}</div>
        </div>
        <div class="button-group">
            <button class="btn-secondary" id="editBtn">编辑</button>
        </div>
    </div>
    
    <h2>基本信息</h2>
    <div class="detail-row">
        <span class="detail-label">描述:</span>
        <span class="detail-value">${skill.description || "无"}</span>
    </div>
    ${skill.descriptionCn ? `
    <div class="detail-row">
        <span class="detail-label">中文描述:</span>
        <span class="detail-value">${skill.descriptionCn}</span>
    </div>
    ` : ''}
    
    <h2>技能内容预览</h2>
    <div class="content-preview">${skill.content}</div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('editBtn').addEventListener('click', function() {
            vscode.postMessage({
                command: 'editSkill',
                skillId: '${skill.id}'
            });
        });
    </script>
</body>
</html>
        `;

          // 处理webview消息
          detailPanel.webview.onDidReceiveMessage(
            async (message) => {
              switch (message.command) {
                case "editSkill":
                  const editSkill = skillManager.getSkill(message.skillId);
                  if (editSkill) {
                    skillWebviewProvider.showSkillEditorPanel(editSkill);
                  }
                  break;
              }
            },
            undefined,
            context.subscriptions,
          );
        }
      }
    }
  });

  // Generate skill command
  const generateSkillCommand = vscode.commands.registerCommand(
    "iflow.generateSkill",
    async () => {
      // 获取当前工作区根目录作为默认路径
      const workspaceFolders = vscode.workspace.workspaceFolders;
      let defaultUri: vscode.Uri | undefined;
      if (workspaceFolders && workspaceFolders.length > 0) {
        defaultUri = workspaceFolders[0].uri;
      }

      // 让用户选择文件夹，默认路径为当前工作区根目录
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "选择要创建 Skill 的文件夹",
        title: "选择要创建 Skill 的文件夹",
        defaultUri: defaultUri,
      });

      if (!folderUri || folderUri.length === 0) {
        return;
      }

      const projectPath = folderUri[0].fsPath;
      const projectName = path.basename(projectPath);

      // 直接使用文件夹名称作为技能名称，显示确认对话框
      const confirm = await vscode.window.showInformationMessage(
        `确认为文件夹 "${projectName}" 创建 Skill 吗？`,
        { modal: true },
        "确认",
      );

      if (!confirm) {
        return;
      }

      // 使用进度窗口显示创建过程
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `正在创建 Skill: ${projectName}`,
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0, message: "准备创建..." });

          // 定义进度回调函数
          const progressCallback = (message: string) => {
            progress.report({ message: message });
          };

          await skillManager.createSkill(
            projectName,
            projectName,
            projectPath,
            progressCallback,
          );

          progress.report({ increment: 100, message: "完成！" });
        },
      );

      skillsTreeDataProvider.refresh();
      vscode.window.showInformationMessage(
        `Skill "${projectName}" created successfully!`,
      );
    },
  );

  // Refresh skills command
  const refreshSkillsCommand = vscode.commands.registerCommand(
    "iflow.refreshSkills",
    async () => {
      // 先清空列表再加载数据
      skillManager.reloadSkills();
      skillsTreeDataProvider.refresh();
      vscode.window.showInformationMessage("Skills refreshed successfully!");
    },
  );

  // Clear skills list command
  const clearSkillsCommand = vscode.commands.registerCommand(
    "iflow.clearSkills",
    async () => {
      skillManager.clearSkills();
      skillsTreeDataProvider.refresh();
      vscode.window.showInformationMessage("Skills list cleared!");
    },
  );

  // Check sync status command
  const checkSyncStatusCommand = vscode.commands.registerCommand(
    "iflow.checkSyncStatus",
    async (skillItem) => {
      await skillManager.checkGlobalSkillSyncStatus(skillItem.id);
      skillsTreeDataProvider.refresh();
    },
  );

  // Sync from global command
  const syncFromGlobalCommand = vscode.commands.registerCommand(
    "iflow.syncFromGlobal",
    async (skillItem) => {
      const skill = skillManager.getSkill(skillItem.id);
      if (skill) {
        const globalSkillInfo = await skillManager.readGlobalSkill(skill.name);
        if (globalSkillInfo.exists && globalSkillInfo.content) {
          // 更新skill内容
          skill.content = globalSkillInfo.content;
          skill.globalVersion = globalSkillInfo.version;
          skill.syncStatus = "synced";
          skill.updatedAt = new Date().toISOString();
          await skillManager.updateSkill(skill);
          // 由于updateSkill会递增版本，需要重置
          skill.version = skill.version - 1;
          skill.syncStatus = "synced";
          await skillManager.saveSkillToFilePublic(skill);

          skillsTreeDataProvider.refresh();
          vscode.window.showInformationMessage(
            `Skill "${skill.name}" 已从全局同步！`,
          );
        } else {
          vscode.window.showWarningMessage(
            `全局skill "${skill.name}" 不存在！`,
          );
        }
      }
    },
  );

  // Edit skill command
  const editSkillCommand = vscode.commands.registerCommand(
    "iflow.editSkill",
    async (skillItem) => {
      const skill = skillManager.getSkill(skillItem.id);
      if (skill) {
        console.log("编辑 skill - ID:", skill.id);
        console.log("编辑 skill - name:", skill.name);
        console.log("编辑 skill - absolutePath:", skill.absolutePath);
        console.log("编辑 skill - projectPath:", skill.projectPath);
        console.log("编辑 skill - isGlobal:", skill.isGlobal);
        skillWebviewProvider.showSkillEditor(skill);
      }
    },
  );

  // Delete skill command
  const deleteSkillCommand = vscode.commands.registerCommand(
    "iflow.deleteSkill",
    async (skillItem) => {
      const skill = skillManager.getSkill(skillItem.id);
      if (!skill) {
        return;
      }

      let message: string;
      let options: vscode.MessageItem[];

      // 根据技能类型提供不同的删除选项
      if (skill.isGlobal) {
        // 全局技能：直接删除文件
        message = `Are you sure you want to delete global skill "${skill.name}"?`;
        options = [
          { title: "Delete" },
          { title: "Cancel", isCloseAffordance: true },
        ];
      } else {
        // 本地技能：直接删除
        message = `Are you sure you want to delete skill "${skill.name}"?`;
        options = [
          { title: "Delete" },
          { title: "Cancel", isCloseAffordance: true },
        ];
      }

      const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        ...options,
      );

      if (choice?.title === "Delete") {
        try {
          // 根据技能类型执行不同的删除逻辑
          if (skill.isGlobal) {
            // 全局技能：只删除全局文件和记录
            await skillManager.deleteSkillFromGlobal(skillItem.id);
          } else {
            // 本地技能：只删除本地文件和记录
            await skillManager.deleteSkill(skillItem.id);
          }

          // 重新加载技能列表，确保删除操作立即生效
          skillManager.reloadSkills();
          skillsTreeDataProvider.refresh();

          vscode.window.showInformationMessage(`Skill "${skill.name}" deleted!`);
        } catch (error) {
          console.error("Failed to delete skill:", error);
          vscode.window.showErrorMessage(`Failed to delete skill "${skill.name}": ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    },
  );

  // View skill detail command
  const viewSkillDetailCommand = vscode.commands.registerCommand(
    "iflow.viewSkillDetail",
    async (skillItem) => {
      // 从文件中读取最新的 skill 内容
      const skill = await skillManager.readSkillFromFile(skillItem.id);
      if (!skill) {
        vscode.window.showErrorMessage("Skill not found!");
        return;
      }

      // 检查是否已有打开的详情页面
      const existingPanel = openDetailPanels.get(skillItem.id);
      if (existingPanel) {
        // 如果已打开，直接显示该页面
        existingPanel.reveal(existingPanel.viewColumn || vscode.ViewColumn.One);
        return;
      }

      const statusLabels: Record<string, string> = {
        synced: "已同步",
        modified: "已修改",
        outdated: "待更新",
        new: "新建",
      };

      const detailPanel = vscode.window.createWebviewPanel(
        "iflowSkillDetail",
        `Skill Details: ${skill.name}`,
        vscode.ViewColumn.One,
        {
          enableScripts: false,
          retainContextWhenHidden: true,
        },
      );

      // 保存到已打开面板Map中
      openDetailPanels.set(skillItem.id, detailPanel);

      // 当面板关闭时，从Map中移除
      detailPanel.onDidDispose(() => {
        openDetailPanels.delete(skillItem.id);
      });

      detailPanel.webview.html = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Skill Details: ${skill.name}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                    margin: 0;
                    width: 100%;
                    box-sizing: border-box;
                    line-height: 1.6;
                }
                html {
                    width: 100%;
                    margin: 0;
                }
                h1 {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                }
                h2 {
                    font-size: 18px;
                    font-weight: bold;
                    margin: 20px 0 10px 0;
                    color: var(--vscode-textLink-foreground);
                }
                .detail-row {
                    display: flex;
                    margin: 8px 0;
                }
                .detail-label {
                    font-weight: 600;
                    min-width: 120px;
                    color: var(--vscode-descriptionForeground);
                }
                .detail-value {
                    flex: 1;
                }
                .status-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 3px;
                    font-size: 12px;
                    font-weight: 600;
                }
                .status-synced { background-color: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
                .status-modified { background-color: rgba(220, 220, 170, 0.2); color: #dcdcaa; }
                .status-outdated { background-color: rgba(206, 145, 120, 0.2); color: #ce9178; }
                .status-new { background-color: rgba(86, 156, 214, 0.2); color: #569cd6; }
                .content-preview {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    border-radius: 4px;
                    margin: 10px 0;
                    max-height: 50vh;
                    min-height: 200px;
                    overflow-y: auto;
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-break: break-word;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 13px;
                    line-height: 1.5;
                }
                .full-document {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 20px;
                    border-radius: 4px;
                    margin: 20px 0;
                    max-height: 60vh;
                    overflow-y: auto;
                    overflow-x: auto;
                    white-space: pre-wrap;
                    word-break: break-word;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 13px;
                    line-height: 1.6;
                    border: 2px solid var(--vscode-panel-border);
                }
                .full-document h1, .full-document h2, .full-document h3 {
                    margin-top: 20px;
                    margin-bottom: 10px;
                    color: var(--vscode-textLink-foreground);
                }
                .full-document h1 {
                    font-size: 24px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                }
                .full-document h2 {
                    font-size: 20px;
                }
                .full-document h3 {
                    font-size: 16px;
                }
                .full-document code {
                    background-color: rgba(255,255,255,0.1);
                    padding: 2px 6px;
                    border-radius: 3px;
                }
                .full-document pre {
                    background-color: var(--vscode-editor-background);
                    padding: 15px;
                    border-radius: 4px;
                    overflow-x: auto;
                    margin: 10px 0;
                }
                .info-box {
                    background-color: var(--vscode-editor-selectionBackground);
                    padding: 10px 15px;
                    border-radius: 4px;
                    margin: 10px 0;
                    border-left: 3px solid var(--vscode-textLink-foreground);
                }
            </style>
        </head>
        <body>
            <h1>${skill.name}</h1>
            
            <h2>基本信息</h2>
            <div class="detail-row">
                <span class="detail-label">描述:</span>
                <span class="detail-value">${skill.description || "无"}</span>
            </div>
            ${skill.descriptionCn ? `
            <div class="detail-row">
                <span class="detail-label">中文描述:</span>
                <span class="detail-value">${skill.descriptionCn}</span>
            </div>
            ` : ''}
            ${skill.githubDescription ? `
            <div class="detail-row">
                <span class="detail-label">GitHub 备注:</span>
                <span class="detail-value"><div class="info-box">${skill.githubDescription}</div></span>
            </div>
            ` : ''}
            <div class="detail-row">
                <span class="detail-label">类型:</span>
                <span class="detail-value">${skill.isGlobal ? '<span class="status-badge status-synced">全局技能</span>' : "本地技能"}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">项目路径:</span>
                <span class="detail-value"><code>${skill.projectPath}</code></span>
            </div>
            <div class="detail-row">
                    <span class="detail-label">绝对路径:</span>
                    <span class="detail-value"><code>${skill.absolutePath || skill.projectPath + "/" + skill.name + ".md"}</code></span>
                </div>            <div class="detail-row">
                <span class="detail-label">版本:</span>
                <span class="detail-value">v${skill.version}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">全局版本:</span>
                <span class="detail-value">${skill.globalVersion ? "v" + skill.globalVersion : "未同步"}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">同步状态:</span>
                <span class="detail-value">
                    <span class="status-badge status-${skill.syncStatus}">${statusLabels[skill.syncStatus] || skill.syncStatus}</span>
                </span>
            </div>
            
            <h2>时间信息</h2>
            <div class="detail-row">
                <span class="detail-label">创建时间:</span>
                <span class="detail-value">${new Date(skill.createdAt).toLocaleString("zh-CN")}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">最后更新:</span>
                <span class="detail-value">${new Date(skill.updatedAt).toLocaleString("zh-CN")}</span>
            </div>
            
            <h2>技能内容预览</h2>
            <div class="content-preview">${skill.content}</div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('saveToGlobalBtn').addEventListener('click', function() {
                    vscode.postMessage({
                        command: 'saveToGlobal',
                        skillId: '${skill.id}'
                    });
                });
                
                document.getElementById('editBtn').addEventListener('click', function() {
                    vscode.postMessage({
                        command: 'editSkill',
                        skillId: '${skill.id}'
                    });
                });
            </script>
        </body>
        </html>
            `;
    },
  );

  // Register webview panel provider for editing
  const openSkillEditorCommand = vscode.commands.registerCommand(
    "iflow.openSkillEditor",
    (skill) => {
      skillWebviewProvider.showSkillEditorPanel(skill);
    },
  );

  // Show all skills command
  const showAllSkillsCommand = vscode.commands.registerCommand(
    "iflow.showAllSkills",
    async () => {
      const skills = skillManager.getAllSkills();
      if (skills.length === 0) {
        vscode.window.showInformationMessage(
          "No skills found. Create one first!",
        );
        return;
      }

      // 让用户选择要编辑或删除的技能
      const selected = await vscode.window.showQuickPick(
        skills.map((skill) => ({
          label: skill.name,
          description: skill.description,
          detail: `Path: ${skill.projectPath} | Status: ${skill.syncStatus} | Version: v${skill.version}`,
          skill: skill,
        })),
        {
          placeHolder: "Select a skill to edit or delete",
          title: "All Skills",
        },
      );

      if (!selected) {
        return;
      }

      // 询问用户要做什么操作
      const action = await vscode.window.showQuickPick(
        [
          { label: "查看详情", description: "View skill details" },
          { label: "编辑", description: "Edit skill content" },
          { label: "删除", description: "Delete this skill" },
          { label: "导入到全局", description: "Import skill to global iFlow" },
        ],
        {
          placeHolder: "What would you like to do?",
        },
      );

      if (!action) {
        return;
      }

      if (action.label === "查看详情") {
        // 显示技能详情 - 从文件中读取最新内容
        const skill = await skillManager.readSkillFromFile(selected.skill.id);
        if (!skill) {
          vscode.window.showErrorMessage("无法读取 skill 文件！");
          return;
        }

        // 检查是否已有打开的详情页面
        const existingPanel = openDetailPanels.get(selected.skill.id);
        if (existingPanel) {
          // 如果已打开，直接显示该页面
          existingPanel.reveal(
            existingPanel.viewColumn || vscode.ViewColumn.One,
          );
          return;
        }

        const detailPanel = vscode.window.createWebviewPanel(
          "iflowSkillDetail",
          `Skill Details: ${skill.name}`,
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
          },
        );

        // 保存到已打开面板Map中
        openDetailPanels.set(selected.skill.id, detailPanel);

        // 当面板关闭时，从Map中移除
        detailPanel.onDidDispose(() => {
          openDetailPanels.delete(selected.skill.id);
        });

        detailPanel.webview.html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skill Details: ${skill.name}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
            width: 100%;
            box-sizing: border-box;
            line-height: 1.6;
        }
        html {
            width: 100%;
            margin: 0;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 20px;
        }

        .header-left {
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex: 1;
            min-width: 0;
        }

        .title {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-foreground);
            margin: 0;
        }

        .skill-path {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
        }

        .button-group {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-shrink: 0;
        }

        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: background-color 0.2s;
            white-space: nowrap;
        }

        .btn-primary {
            background-color: var(--vscode-button-primaryBackground);
            color: var(--vscode-button-primaryForeground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-primaryHoverBackground);
        }

        .btn-success {
            background-color: #4ec9b0;
            color: #1e1e1e;
        }

        .btn-success:hover {
            background-color: #3db892;
        }

        h2 {
            font-size: 18px;
            font-weight: bold;
            margin: 20px 0 10px 0;
            color: var(--vscode-textLink-foreground);
        }
        .detail-row {
            display: flex;
            margin: 8px 0;
        }
        .detail-label {
            font-weight: 600;
            min-width: 120px;
            color: var(--vscode-descriptionForeground);
        }
        .detail-value {
            flex: 1;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-synced { background-color: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
        .status-modified { background-color: rgba(220, 220, 170, 0.2); color: #dcdcaa; }
        .status-outdated { background-color: rgba(206, 145, 120, 0.2); color: #ce9178; }
        .status-new { background-color: rgba(86, 156, 214, 0.2); color: #569cd6; }
        .content-preview {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 20px;
            border-radius: 4px;
            margin: 20px 0;
            max-height: 70vh;
            overflow-y: auto;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-word;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 1.6;
            border: 1px solid var(--vscode-panel-border);
        }
        .content-preview h1, .content-preview h2, .content-preview h3 {
            margin-top: 20px;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .content-preview h1 {
            font-size: 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        .content-preview h2 {
            font-size: 20px;
        }
        .content-preview h3 {
            font-size: 16px;
        }
        .content-preview code {
            background-color: rgba(255,255,255,0.1);
            padding: 2px 6px;
            border-radius: 3px;
        }
        .content-preview pre {
            background-color: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <h1>${skill.name}</h1>
    
    <div class="button-container">
        <button class="btn-secondary" id="editBtn">编辑</button>
    </div>

    <h2>基本信息</h2>
    <div class="detail-row">
        <span class="detail-label">描述:</span>
        <span class="detail-value">${skill.description || "无"}</span>
    </div>
    ${skill.descriptionCn ? `
    <div class="detail-row">
        <span class="detail-label">中文描述:</span>
        <span class="detail-value">${skill.descriptionCn}</span>
    </div>
    ` : ''}
    ${skill.githubDescription ? `
    <div class="detail-row">
        <span class="detail-label">GitHub 备注:</span>
        <span class="detail-value">${skill.githubDescription}</span>
    </div>
    ` : ''}
    <div class="detail-row">
        <span class="detail-label">类型:</span>
        <span class="detail-value">${skill.isGlobal ? "全局技能" : "本地技能"}</span>
    </div>
    <div class="detail-row">
        <span class="detail-label">版本:</span>
        <span class="detail-value">v${skill.version}</span>
    </div>
    
    <h2>技能内容</h2>
    <div class="content-preview">${skill.content}</div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('editBtn').addEventListener('click', function() {
            vscode.postMessage({
                command: 'editSkill',
                skillId: '${skill.id}'
            });
        });
    </script>
</body>
</html>
        `;

        // 处理webview消息
        detailPanel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case "editSkill":
                const editSkill = skillManager.getSkill(message.skillId);
                if (editSkill) {
                  skillWebviewProvider.showSkillEditorPanel(editSkill);
                }
                break;
            }
          },
          undefined,
          context.subscriptions,
        );
      } else if (action.label === "编辑") {
        skillWebviewProvider.showSkillEditorPanel(selected.skill);
      } else if (action.label === "删除") {
        const skill = skillManager.getSkill(selected.skill.id);
        if (!skill) {
          return;
        }

        let message: string;
        let options: vscode.MessageItem[];

        // 根据技能类型提供不同的删除选项
        if (skill.isGlobal) {
          // 全局技能：直接删除文件
          message = `Are you sure you want to delete global skill "${skill.name}"?`;
          options = [
            { title: "Delete" },
            { title: "Cancel", isCloseAffordance: true },
          ];
        } else {
          // 本地技能：直接删除
          message = `Are you sure you want to delete skill "${skill.name}"?`;
          options = [
            { title: "Delete" },
            { title: "Cancel", isCloseAffordance: true },
          ];
        }

        const choice = await vscode.window.showWarningMessage(
          message,
          { modal: true },
          ...options,
        );

        if (choice?.title === "Delete") {
          if (skill.isGlobal) {
            // 删除全局技能文件
            await skillManager.deleteSkillFromGlobal(selected.skill.id);
            skillsTreeDataProvider.refresh();
            vscode.window.showInformationMessage(
              `Global skill "${skill.name}" deleted!`,
            );
          } else {
            // 删除本地技能
            await skillManager.deleteSkill(selected.skill.id);
            skillsTreeDataProvider.refresh();
            vscode.window.showInformationMessage(`Skill "${skill.name}" deleted!`);
          }
        }
      } else if (action.label === "导入到全局") {
        const result = await skillManager.importSkillToGlobal(
          selected.skill.id,
        );
        if (result.success) {
          skillsTreeDataProvider.refresh();
          vscode.window.showInformationMessage(
            `技能 "${selected.skill.name}" 已导入到全局 iFlow！`,
          );
        } else {
          vscode.window.showErrorMessage(`导入失败: ${result.error}`);
        }
      }
    },
  );

  // Open terminal command
  const openTerminalCommand = vscode.commands.registerCommand(
    "iflow.openTerminal",
    () => {
      const terminal = vscode.window.createTerminal("iFlow Terminal");
      terminal.sendText("iflow -y");
      terminal.show();
    },
  );

  // Install iFlow command
  const installIflowCommand = vscode.commands.registerCommand(
    "iflow.install",
    async () => {
      const isInstalled = await skillManager.checkIflowInstalled();

      if (isInstalled) {
        const choice = await vscode.window.showInformationMessage(
          "iFlow CLI 已安装，是否需要重新安装？",
          "重新安装",
          "取消",
        );

        if (choice !== "重新安装") {
          return;
        }
      }

      const openUrl = "https://cli.iflow.cn/?utm_source=isflower";
      await vscode.env.openExternal(vscode.Uri.parse(openUrl));

      vscode.window.showInformationMessage(
        "已打开 iFlow CLI 官网，请按照页面提示进行安装。",
        "OK",
      );
    },
  );

  // Search skills online command
  const searchSkillsCommand = vscode.commands.registerCommand(
    "iflow.searchSkills",
    () => {
      skillSearchProvider.showSearchPanel();
    },
  );

  // 打开文件命令
  const openFileCommand = vscode.commands.registerCommand(
    "iflow.openFile",
    async (filePath: string) => {
      try {
        const uri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand("vscode.open", uri);
      } catch (error) {
        vscode.window.showErrorMessage(
          `打开文件失败: ${error instanceof Error ? error.message : "未知错误"}`
        );
      }
    },
  );

  context.subscriptions.push(
    treeView,
    generateSkillCommand,
    refreshSkillsCommand,
    clearSkillsCommand,
    openTerminalCommand,
    checkSyncStatusCommand,
    syncFromGlobalCommand,
    deleteSkillCommand,
    openSkillEditorCommand,
    showAllSkillsCommand,
    viewSkillDetailCommand,
    openTerminalCommand,
    installIflowCommand,
    searchSkillsCommand,
    openFileCommand,
  );

  // 实时刷新 skill 列表（每10秒一次）
  const refreshInterval = setInterval(async () => {
    skillManager.reloadSkills();
    skillsTreeDataProvider.refresh();
  }, 10000);

  // 在扩展停用时清除定时器
  context.subscriptions.push({
    dispose: () => {
      clearInterval(refreshInterval);
    },
  });
}

export function deactivate() {
  console.log("iFlow Extension deactivated");
}
