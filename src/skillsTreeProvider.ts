import * as vscode from 'vscode';
import * as path from 'path';
import { SkillManager, Skill } from './skillManager';

export class SkillsTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly skill?: Skill,
        public readonly id?: string
    ) {
        super(label, collapsibleState);
        this.contextValue = skill ? 'skill' : 'category';
        
        if (skill) {
            this.id = skill.id;
            
            // 保留原来的绿色圆点图标（根据是否匹配当前工作区）
            const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const isMatch = currentWorkspaceFolder && (skill.projectPath === currentWorkspaceFolder || skill.projectPath.startsWith(currentWorkspaceFolder + path.sep));
            
            // 根据是否匹配显示不同透明度的绿色圆点
            if (isMatch) {
                // 匹配：实心绿色圆点
                this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
            } else {
                // 不匹配：空心绿色圆点
                this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('terminal.ansiGreen'));
            }
            
            // 在 label 后面添加同步状态
            const statusLabels: Record<string, string> = {
                'synced': '已同步',
                'modified': '已修改',
                'outdated': '待更新',
                'new': '新建'
            };
            
            const statusLabel = statusLabels[skill.syncStatus] || skill.syncStatus;
            this.label = `${skill.name} - ${statusLabel}`;
            
            // 显示绝对路径和同步状态
            const absolutePath = skill.absolutePath || path.join(skill.projectPath, `${skill.name}.md`);
            
            this.tooltip = `${skill.description}\n路径: ${absolutePath}\n版本: v${skill.version}\n全局版本: v${skill.globalVersion ?? '未同步'}\n状态: ${statusLabel}${skill.isGlobal ? '\n类型: 全局技能' : ''}`;
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

export class SkillsTreeDataProvider implements vscode.TreeDataProvider<SkillsTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SkillsTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    /**
     * 获取跨平台的 iflow 全局技能目录路径
     */
    private static getIflowGlobalSkillsPath(): string {
      const config = vscode.workspace.getConfiguration("iflow");
      const configPath = config.get<string>("globalSkillsPath");
      if (configPath) {
        return configPath;
      }

      const platform = process.platform;
      let homeDir: string;

      if (platform === 'win32') {
        homeDir = process.env.USERPROFILE || process.env.HOME || '';
      } else {
        homeDir = process.env.HOME || '';
      }

      return require('path').join(homeDir, '.iflow', 'skills');
    }

    constructor(private skillManager: SkillManager) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SkillsTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SkillsTreeItem): Thenable<SkillsTreeItem[]> {
        if (!element) {
            // Root level - show all skills grouped by project path
            const skills = this.skillManager.getAllSkills();
            const groupedSkills = new Map<string, Skill[]>();

            skills.forEach(skill => {
                // 使用完整的projectPath作为分组键，确保不同路径的相同名称项目分开显示
                const projectKey = skill.projectPath;
                if (!groupedSkills.has(projectKey)) {
                    groupedSkills.set(projectKey, []);
                }
                groupedSkills.get(projectKey)!.push(skill);
            });

            const items: SkillsTreeItem[] = [];
            
            // 首先添加全局技能分组
            const globalSkillsPath = SkillsTreeDataProvider.getIflowGlobalSkillsPath();
            if (groupedSkills.has(globalSkillsPath)) {
                items.push(
                    new SkillsTreeItem(
                        '全局技能',
                        vscode.TreeItemCollapsibleState.Collapsed,
                        undefined,
                        globalSkillsPath
                    )
                );
                groupedSkills.delete(globalSkillsPath);
            }
            
            // 然后添加本地技能分组
            groupedSkills.forEach((skills, projectPath) => {
                // 获取项目名称和路径的一部分用于显示
                const projectName = path.basename(projectPath);
                const parentPath = path.dirname(projectPath);
                const displayLabel = projectName === parentPath ? projectName : `${projectName} (${parentPath})`;
                
                items.push(
                    new SkillsTreeItem(
                        displayLabel,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        undefined,
                        projectPath
                    )
                );
            });

            return Promise.resolve(items);
        } else {
            // Project level - show skills for this specific path
            const skills = this.skillManager.getAllSkills().filter(skill => skill.projectPath === element.id);
            return Promise.resolve(
                skills.map(skill => new SkillsTreeItem(
                    skill.name + (skill.description ? ` - ${skill.description}` : ''),
                    vscode.TreeItemCollapsibleState.None,
                    skill,
                    skill.id
                ))
            );
        }
    }
}