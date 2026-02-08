import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SkillManager, Skill } from './skillManager';

// 多语言支持
interface I18nMessages {
    globalSkills: string;
    projectSkills: string;
    items: string;
    noSkills: string;
    synced: string;
    modified: string;
    outdated: string;
    new: string;
    noDescription: string;
}

function getI18nMessages(): I18nMessages {
    const locale = vscode.env.language;
    const isZh = locale.startsWith('zh');
    
    if (isZh) {
        return {
            globalSkills: '🌍 全局技能',
            projectSkills: '📁 项目技能',
            items: '项',
            noSkills: '暂无技能。点击"生成技能"创建一个。',
            synced: '已同步',
            modified: '已修改',
            outdated: '待更新',
            new: '新建',
            noDescription: '暂无描述'
        };
    } else {
        return {
            globalSkills: '🌍 Global Skills',
            projectSkills: '📁 Project Skills',
            items: 'items',
            noSkills: 'No skills found. Click "Generate Skill" to create one.',
            synced: 'Synced',
            modified: 'Modified',
            outdated: 'Outdated',
            new: 'New',
            noDescription: 'No description'
        };
    }
}

export class SkillsTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly skill?: Skill,
        public readonly id?: string,
        public readonly filePath?: string,
        public readonly isFile?: boolean
    ) {
        super(label, collapsibleState);
        
        // 设置 id
        if (id) {
            this.id = id;
        } else if (skill) {
            this.id = skill.id;
        }
        
        // 设置 contextValue
        if (skill) {
            // 根据技能类型设置不同的 contextValue
            if (skill.isGlobal) {
                this.contextValue = 'global-skill';
            } else if (skill.isProjectLocal) {
                this.contextValue = 'project-skill';
            } else {
                this.contextValue = 'skill';
            }
            
            // 保留原来的绿色圆点图标（根据是否匹配当前工作区）
            const currentWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const isMatch = currentWorkspaceFolder && (skill.projectPath === currentWorkspaceFolder || skill.projectPath.startsWith(currentWorkspaceFolder + path.sep));
            
            const messages = getI18nMessages();
            
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
                'synced': messages.synced,
                'modified': messages.modified,
                'outdated': messages.outdated,
                'new': messages.new
            };
            
            const statusLabel = statusLabels[skill.syncStatus] || skill.syncStatus;
            this.label = `${skill.name} - ${statusLabel}`;
            
            // 显示技能介绍信息作为 tooltip
            const description = skill.description || messages.noDescription;
            const absolutePath = skill.absolutePath || path.join(skill.projectPath, `${skill.name}.md`);
            
            const locale = vscode.env.language;
            const isZh = locale.startsWith('zh');
            
            if (isZh) {
                this.tooltip = `📝 ${description}

📂 路径: ${absolutePath}
📦 版本: v${skill.version}
🌍 全局版本: v${skill.globalVersion ?? '未同步'}
📊 状态: ${statusLabel}
${skill.isGlobal ? '🌟 类型: 全局技能' : '🔹 类型: 本地技能'}`;
            } else {
                this.tooltip = `📝 ${description}

📂 Path: ${absolutePath}
📦 Version: v${skill.version}
🌍 Global Version: v${skill.globalVersion ?? 'N/A'}
📊 Status: ${statusLabel}
${skill.isGlobal ? '🌟 Type: Global Skill' : '🔹 Type: Local Skill'}`;
            }
            
            // 技能项不设置 command，只能通过箭头展开或查看详情
            this.command = undefined;
        } else if (filePath) {
            // 文件夹或文件项
            if (isFile) {
                this.contextValue = 'file';
                this.iconPath = new vscode.ThemeIcon('file');
                this.tooltip = filePath;
                // 只有点击文件时才打开
                this.command = {
                    command: 'iflow.openFile',
                    title: 'Open File',
                    arguments: [filePath]
                };
            } else {
                this.contextValue = 'folder';
                this.iconPath = new vscode.ThemeIcon('folder');
                this.tooltip = filePath;
                // 文件夹不设置 command，只能通过箭头展开
                this.command = undefined;
            }
        } else {
            this.contextValue = 'category';
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
            // Root level - 分组显示全局技能和项目技能
            const skills = this.skillManager.getAllSkills();
            const messages = getI18nMessages();
            
            // 分离全局技能和项目技能
            const globalSkills = skills.filter(skill => skill.isGlobal);
            const projectLocalSkills = skills.filter(skill => skill.isProjectLocal);
            
            const items: SkillsTreeItem[] = [];
            
            // 添加全局技能分组
            if (globalSkills.length > 0) {
                const globalGroup = new SkillsTreeItem(
                    messages.globalSkills,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    'global-group'
                );
                globalGroup.description = `${globalSkills.length} ${messages.items}`;
                items.push(globalGroup);
            }
            
            // 添加项目本地技能分组
            if (projectLocalSkills.length > 0) {
                const projectGroup = new SkillsTreeItem(
                    messages.projectSkills,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    'project-group'
                );
                projectGroup.description = `${projectLocalSkills.length} ${messages.items}`;
                items.push(projectGroup);
            }
            
            // 如果没有任何技能，显示提示
            if (items.length === 0) {
                items.push(new SkillsTreeItem(
                    messages.noSkills,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    'empty-message'
                ));
            }
            
            return Promise.resolve(items);
        } else if (element.id === 'global-group') {
            // 显示全局技能
            const skills = this.skillManager.getAllSkills().filter(skill => skill.isGlobal);
            const items: SkillsTreeItem[] = [];
            
            skills.forEach(skill => {
                if (skill.absolutePath) {
                    const globalSkillsDir = SkillsTreeDataProvider.getIflowGlobalSkillsPath();
                    const skillDir = path.dirname(skill.absolutePath);
                    
                    // 判断 SKILL.md 的父目录是否就是全局技能根目录
                    if (skillDir === globalSkillsDir) {
                        // SKILL.md 在根目录，不可展开
                        items.push(new SkillsTreeItem(
                            skill.name,
                            vscode.TreeItemCollapsibleState.None,
                            skill,
                            skill.id
                        ));
                    } else {
                        // SKILL.md 在子文件夹中，可展开
                        items.push(new SkillsTreeItem(
                            skill.name,
                            vscode.TreeItemCollapsibleState.Collapsed,
                            skill,
                            skill.id
                        ));
                    }
                } else {
                    items.push(new SkillsTreeItem(
                        skill.name,
                        vscode.TreeItemCollapsibleState.None,
                        skill,
                        skill.id
                    ));
                }
            });
            
            return Promise.resolve(items);
        } else if (element.id === 'project-group') {
            // 显示项目本地技能
            const skills = this.skillManager.getAllSkills().filter(skill => skill.isProjectLocal);
            const items: SkillsTreeItem[] = [];
            
            skills.forEach(skill => {
                items.push(new SkillsTreeItem(
                    skill.name,
                    vscode.TreeItemCollapsibleState.None,
                    skill,
                    skill.id
                ));
            });
            
            return Promise.resolve(items);
        } else if (element.skill && element.skill.projectPath) {
            // 展开技能子文件夹
            return this.getSkillFolderContents(element.skill.projectPath);
        } else if (element.filePath && !element.isFile) {
            // 展开子文件夹
            return this.getSkillFolderContents(element.filePath);
        }
        
        return Promise.resolve([]);
    }
    
    private getSkillFolderContents(folderPath: string): Thenable<SkillsTreeItem[]> {
        const fs = require('fs');
        const items: SkillsTreeItem[] = [];
        
        if (!fs.existsSync(folderPath)) {
            return Promise.resolve([]);
        }
        
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        
        entries.forEach((entry: any) => {
            const fullPath = path.join(folderPath, entry.name);
            
            if (entry.isDirectory()) {
                items.push(new SkillsTreeItem(
                    entry.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    undefined,
                    fullPath,
                    false
                ));
            } else if (entry.isFile()) {
                items.push(new SkillsTreeItem(
                    entry.name,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    fullPath,
                    true
                ));
            }
        });
        
        // 排序：文件夹在前，文件在后
        items.sort((a, b) => {
            if (a.isFile && !b.isFile) return 1;
            if (!a.isFile && b.isFile) return -1;
            return a.label.localeCompare(b.label);
        });
        
        return Promise.resolve(items);
    }
}