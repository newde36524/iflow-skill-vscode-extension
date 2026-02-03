import * as vscode from "vscode";
import * as path from "path";
import { SkillsTreeDataProvider } from "./skillsTreeProvider";
import { SkillWebviewProvider } from "./skillWebviewProvider";
import { SkillManager } from "./skillManager";

export async function activate(context: vscode.ExtensionContext) {
  console.log("iFlow Extension is now active!");

  const skillManager = new SkillManager(context);
  const skillsTreeDataProvider = new SkillsTreeDataProvider(skillManager);
  const skillWebviewProvider = new SkillWebviewProvider(
    context.extensionUri,
    skillManager,
  );

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

  // Handle double-click on skill items to show details
  treeView.onDidChangeSelection(async (e) => {
    if (e.selection.length === 1 && e.selection[0].contextValue === 'skill') {
      const skillItem = e.selection[0];
      if (skillItem.id) {
        const skill = skillManager.getSkill(skillItem.id);
        if (skill) {
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
        
        /* 按钮容器 */
        .button-container {
            display: flex;
            gap: 10px;
            margin: 15px 0;
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
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
    
    <div class="button-container">
        <button class="btn-success" id="saveToGlobalBtn">保存到全局</button>
    </div>
    
    <h2>基本信息</h2>    <div class="detail-row">
        <span class="detail-label">描述:</span>
        <span class="detail-value">${skill.description || "无"}</span>
    </div>
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
        <span class="detail-value"><code>${skill.absolutePath || (skill.projectPath + "/" + skill.name + ".md")}</code></span>
    </div>
    <div class="detail-row">
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
    <div class="content-preview">${skill.content.substring(0, 1000)}${skill.content.length > 1000 ? "..." : ""}</div>
    
    <h2>完整文档</h2>
    <div class="full-document">${skill.content}</div>
    
    <div class="info-box">
        <strong>提示:</strong> 要编辑此技能，请右键选择"编辑"操作。
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        document.getElementById('saveToGlobalBtn').addEventListener('click', function() {
            vscode.postMessage({
                command: 'saveToGlobal',
                skillId: '${skill.id}'
            });
        });
    </script>
</body>
</html>
        `;
        
        // 处理webview消息
        detailPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'saveToGlobal':
                        const result = await skillManager.importSkillToGlobal(message.skillId);
                        if (result.success) {
                            vscode.window.showInformationMessage(`技能 "${skill.name}" 已保存到全局！`);
                        } else {
                            vscode.window.showErrorMessage(`保存失败: ${result.error}`);
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
        }
      }
    }
  });

  // Generate skill command
  const generateSkillCommand = vscode.commands.registerCommand(
    "iflow.generateSkill",
    async () => {
      // Let user select any folder
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Select Folder for Skill",
        title: "选择要创建 Skill 的文件夹",
      });

      if (!folderUri || folderUri.length === 0) {
        return;
      }

      const projectPath = folderUri[0].fsPath;
      const projectName = path.basename(projectPath);

      const skillName = await vscode.window.showInputBox({
        prompt: "Enter skill name",
        placeHolder: projectName,
        value: projectName,
      });

      if (!skillName) {
        return;
      }

      const skillDescription = await vscode.window.showInputBox({
        prompt: "Enter skill description",
        placeHolder: `Skill for ${projectName}`,
      });

      if (!skillDescription) {
        return;
      }

      await skillManager.createSkill(skillName, skillDescription, projectPath);
      skillsTreeDataProvider.refresh();
      vscode.window.showInformationMessage(
        `Skill "${skillName}" created successfully!`,
      );
    },
  );

  // Refresh skills command
  const refreshSkillsCommand = vscode.commands.registerCommand(
    "iflow.refreshSkills",
    async () => {
      // 增量刷新：不清空列表，只添加新的技能
      skillManager.incrementalRefresh();
      skillsTreeDataProvider.refresh();
      vscode.window.showInformationMessage("Skills refreshed successfully!");
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
        skillWebviewProvider.showSkillEditor(skill);
      }
    },
  );

  // Save skill command
  const saveSkillCommand = vscode.commands.registerCommand(
    "iflow.saveSkill",
    async (skillItem) => {
      const result = await skillManager.importSkillToGlobal(skillItem.id);
      if (result.success) {
        vscode.window.showInformationMessage(
          `Skill "${skillItem.label}" imported to global iFlow!`,
        );
      } else {
        vscode.window.showErrorMessage(
          `Failed to import skill: ${result.error}`,
        );
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
        // 全局技能：可以删除文件或仅从列表移除
        message = `What would you like to do with "${skill.name}"?\n\n1. Delete Global Skill File - Delete the actual skill file from ~/.iflow/skills/\n2. Remove from List - Only remove from the list, keep the file`;
        options = [
          { title: "Delete Global Skill File" },
          { title: "Remove from List" },
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
        // 删除本地技能
        await skillManager.deleteSkill(skillItem.id);
        skillsTreeDataProvider.refresh();
        vscode.window.showInformationMessage(`Skill "${skill.name}" deleted!`);
      } else if (choice?.title === "Delete Global Skill File") {
        // 删除全局技能文件
        await skillManager.deleteSkillFromGlobal(skillItem.id);
        skillsTreeDataProvider.refresh();
        vscode.window.showInformationMessage(`Global skill "${skill.name}" file deleted!`);
      } else if (choice?.title === "Remove from List") {
        // 仅从列表移除
        await skillManager.removeSkillFromList(skillItem.id);
        skillsTreeDataProvider.refresh();
        vscode.window.showInformationMessage(`Skill "${skill.name}" removed from list!`);
      }
    },
  );

  // View skill detail command
  const viewSkillDetailCommand = vscode.commands.registerCommand(
    "iflow.viewSkillDetail",
    async (skillItem) => {
      const skill = skillManager.getSkill(skillItem.id);
      if (!skill) {
        vscode.window.showErrorMessage("Skill not found!");
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
            <div class="content-preview">${skill.content.substring(0, 1000)}${skill.content.length > 1000 ? "..." : ""}</div>
            
            <h2>完整文档</h2>
            <div class="full-document">${skill.content}</div>
            
            <div class="info-box">
                <strong>提示:</strong> 要编辑此技能，请选择"编辑"操作。
            </div>
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
        // 显示技能详情
        const skill = selected.skill;
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
        
        /* 按钮容器 */
        .button-container {
            display: flex;
            gap: 10px;
            margin: 15px 0;
            padding: 10px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
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
    </div>
    <div class="detail-row">
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
    <div class="content-preview">${skill.content.substring(0, 1000)}${skill.content.length > 1000 ? "..." : ""}</div>
    
    <h2>完整文档</h2>
    <div class="full-document">${skill.content}</div>
    
    <div class="info-box">
        <strong>提示:</strong> 要编辑此技能，请选择"编辑"操作。
    </div>
</body>
</html>
            `;
      } else if (action.label === "编辑") {
        skillWebviewProvider.showSkillEditorPanel(selected.skill);
      } else if (action.label === "删除") {
        const confirm = await vscode.window.showWarningMessage(
          `确定要删除技能 "${selected.skill.name}" 吗？`,
          "删除",
          "取消",
        );

        if (confirm === "删除") {
          await skillManager.deleteSkill(selected.skill.id);
          skillsTreeDataProvider.refresh();
          vscode.window.showInformationMessage(
            `技能 "${selected.skill.name}" 已删除！`,
          );
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

  context.subscriptions.push(
    treeView,
    generateSkillCommand,
    refreshSkillsCommand,
    checkSyncStatusCommand,
    syncFromGlobalCommand,
    editSkillCommand,
    saveSkillCommand,
    deleteSkillCommand,
    openSkillEditorCommand,
    showAllSkillsCommand,
    viewSkillDetailCommand,
  );

  // 实时刷新 skill 列表（每10秒一次）
  const refreshInterval = setInterval(async () => {
    skillManager.incrementalRefresh();
    skillsTreeDataProvider.refresh();
  }, 10000);

  // 在扩展停用时清除定时器
  context.subscriptions.push({
    dispose: () => {
      clearInterval(refreshInterval);
    }
  });
}

export function deactivate() {
  console.log("iFlow Extension deactivated");
}
