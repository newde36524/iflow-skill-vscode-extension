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
            // 显示绝对路径
            const absolutePath = skill.absolutePath || path.join(skill.projectPath, `${skill.name}.md`);
            this.tooltip = `${skill.description}\nPath: ${absolutePath}\nVersion: v${skill.version}\nStatus: ${skill.syncStatus}${skill.isGlobal ? '\nType: Global Skill' : ''}`;
            
            // 根据syncStatus显示不同的图标
            switch (skill.syncStatus) {
                case 'synced':
                    this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
                    break;
                case 'modified':
                    this.iconPath = new vscode.ThemeIcon('edit', new vscode.ThemeColor('terminal.ansiYellow'));
                    break;
                case 'outdated':
                    this.iconPath = new vscode.ThemeIcon('arrow-circle-down', new vscode.ThemeColor('terminal.ansiRed'));
                    break;
                case 'new':
                default:
                    this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('terminal.ansiBlue'));
                    break;
            }
            
            // 添加描述信息
            this.description = `v${skill.version}`;
            
            // 添加同步状态标签和类型标签
            const statusLabels: Record<string, string> = {
                'synced': '已同步',
                'modified': '已修改',
                'outdated': '待更新',
                'new': '新建'
            };
            this.description += ` · ${statusLabels[skill.syncStatus] || skill.syncStatus}`;
            
            // 如果是全局技能，添加标识
            if (skill.isGlobal) {
                this.description += ' · [全局]';
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

export class SkillsTreeDataProvider implements vscode.TreeDataProvider<SkillsTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SkillsTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

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
            const globalSkillsPath = path.join(process.env.HOME || '', '.iflow', 'skills');
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