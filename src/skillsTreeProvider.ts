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
            
            // 显示技能介绍信息作为 tooltip
            const description = skill.description || '暂无描述';
            const absolutePath = skill.absolutePath || path.join(skill.projectPath, `${skill.name}.md`);
            
            this.tooltip = `📝 ${description}

📂 路径: ${absolutePath}
📦 版本: v${skill.version}
🌍 全局版本: v${skill.globalVersion ?? '未同步'}
📊 状态: ${statusLabel}
${skill.isGlobal ? '🌟 类型: 全局技能' : '🔹 类型: 本地技能'}`;
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
            // Root level - show all skills in a single list, deduplicate by name
            const skills = this.skillManager.getAllSkills();
            
            // 使用 Map 去重，相同 name 的技能只保留一个（优先保留全局技能）
            const uniqueSkills = new Map<string, Skill>();
            
            skills.forEach(skill => {
                if (!uniqueSkills.has(skill.name)) {
                    uniqueSkills.set(skill.name, skill);
                } else {
                    const existing = uniqueSkills.get(skill.name);
                    // 如果已有的是本地技能，新的是全局技能，则替换
                    if (existing && !existing.isGlobal && skill.isGlobal) {
                        uniqueSkills.set(skill.name, skill);
                    }
                }
            });
            
            // 按是否全局技能排序：全局技能在前，本地技能在后
            const sortedSkills = Array.from(uniqueSkills.values()).sort((a, b) => {
                if (a.isGlobal && !b.isGlobal) return -1;
                if (!a.isGlobal && b.isGlobal) return 1;
                return 0;
            });

            return Promise.resolve(
                sortedSkills.map(skill => new SkillsTreeItem(
                    skill.name + (skill.description ? ` - ${skill.description}` : ''),
                    vscode.TreeItemCollapsibleState.None,
                    skill,
                    skill.id
                ))
            );
        } else {
            // No children for skill items
            return Promise.resolve([]);
        }
    }
}