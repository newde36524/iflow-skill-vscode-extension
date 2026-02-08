"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillsTreeDataProvider = exports.SkillsTreeItem = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
function getI18nMessages() {
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
    }
    else {
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
class SkillsTreeItem extends vscode.TreeItem {
    constructor(label, collapsibleState, skill, id, filePath, isFile) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.skill = skill;
        this.id = id;
        this.filePath = filePath;
        this.isFile = isFile;
        // 设置 id
        if (id) {
            this.id = id;
        }
        else if (skill) {
            this.id = skill.id;
        }
        // 设置 contextValue
        if (skill) {
            // 根据技能类型设置不同的 contextValue
            if (skill.isGlobal) {
                this.contextValue = 'global-skill';
            }
            else if (skill.isProjectLocal) {
                this.contextValue = 'project-skill';
            }
            else {
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
            }
            else {
                // 不匹配：空心绿色圆点
                this.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('terminal.ansiGreen'));
            }
            // 在 label 后面添加同步状态
            const statusLabels = {
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
            }
            else {
                this.tooltip = `📝 ${description}

📂 Path: ${absolutePath}
📦 Version: v${skill.version}
🌍 Global Version: v${skill.globalVersion ?? 'N/A'}
📊 Status: ${statusLabel}
${skill.isGlobal ? '🌟 Type: Global Skill' : '🔹 Type: Local Skill'}`;
            }
            // 技能项不设置 command，只能通过箭头展开或查看详情
            this.command = undefined;
        }
        else if (filePath) {
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
            }
            else {
                this.contextValue = 'folder';
                this.iconPath = new vscode.ThemeIcon('folder');
                this.tooltip = filePath;
                // 文件夹不设置 command，只能通过箭头展开
                this.command = undefined;
            }
        }
        else {
            this.contextValue = 'category';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}
exports.SkillsTreeItem = SkillsTreeItem;
class SkillsTreeDataProvider {
    /**
     * 获取跨平台的 iflow 全局技能目录路径
     */
    static getIflowGlobalSkillsPath() {
        const config = vscode.workspace.getConfiguration("iflow");
        const configPath = config.get("globalSkillsPath");
        if (configPath) {
            return configPath;
        }
        const platform = process.platform;
        let homeDir;
        if (platform === 'win32') {
            homeDir = process.env.USERPROFILE || process.env.HOME || '';
        }
        else {
            homeDir = process.env.HOME || '';
        }
        return require('path').join(homeDir, '.iflow', 'skills');
    }
    constructor(skillManager) {
        this.skillManager = skillManager;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root level - 分组显示全局技能和项目技能
            const skills = this.skillManager.getAllSkills();
            const messages = getI18nMessages();
            // 分离全局技能和项目技能
            const globalSkills = skills.filter(skill => skill.isGlobal);
            const projectLocalSkills = skills.filter(skill => skill.isProjectLocal);
            const items = [];
            // 添加全局技能分组
            if (globalSkills.length > 0) {
                const globalGroup = new SkillsTreeItem(messages.globalSkills, vscode.TreeItemCollapsibleState.Collapsed, undefined, 'global-group');
                globalGroup.description = `${globalSkills.length} ${messages.items}`;
                items.push(globalGroup);
            }
            // 添加项目本地技能分组
            if (projectLocalSkills.length > 0) {
                const projectGroup = new SkillsTreeItem(messages.projectSkills, vscode.TreeItemCollapsibleState.Collapsed, undefined, 'project-group');
                projectGroup.description = `${projectLocalSkills.length} ${messages.items}`;
                items.push(projectGroup);
            }
            // 如果没有任何技能，显示提示
            if (items.length === 0) {
                items.push(new SkillsTreeItem(messages.noSkills, vscode.TreeItemCollapsibleState.None, undefined, 'empty-message'));
            }
            return Promise.resolve(items);
        }
        else if (element.id === 'global-group') {
            // 显示全局技能
            const skills = this.skillManager.getAllSkills().filter(skill => skill.isGlobal);
            const items = [];
            skills.forEach(skill => {
                if (skill.absolutePath) {
                    const globalSkillsDir = SkillsTreeDataProvider.getIflowGlobalSkillsPath();
                    const skillDir = path.dirname(skill.absolutePath);
                    // 判断 SKILL.md 的父目录是否就是全局技能根目录
                    if (skillDir === globalSkillsDir) {
                        // SKILL.md 在根目录，不可展开
                        items.push(new SkillsTreeItem(skill.name, vscode.TreeItemCollapsibleState.None, skill, skill.id));
                    }
                    else {
                        // SKILL.md 在子文件夹中，可展开
                        items.push(new SkillsTreeItem(skill.name, vscode.TreeItemCollapsibleState.Collapsed, skill, skill.id));
                    }
                }
                else {
                    items.push(new SkillsTreeItem(skill.name, vscode.TreeItemCollapsibleState.None, skill, skill.id));
                }
            });
            return Promise.resolve(items);
        }
        else if (element.id === 'project-group') {
            // 显示项目本地技能
            const skills = this.skillManager.getAllSkills().filter(skill => skill.isProjectLocal);
            const items = [];
            skills.forEach(skill => {
                if (skill.absolutePath) {
                    const skillDir = path.dirname(skill.absolutePath);
                    const iflowDir = path.join(skill.projectPath, '.iflow');
                    // 判断 SKILL.md 文件是否在 .iflow 根目录
                    if (skillDir === iflowDir) {
                        // SKILL.md 在 .iflow 根目录，不可展开
                        items.push(new SkillsTreeItem(skill.name, vscode.TreeItemCollapsibleState.None, skill, skill.id));
                    }
                    else {
                        // SKILL.md 在子文件夹中，可展开
                        items.push(new SkillsTreeItem(skill.name, vscode.TreeItemCollapsibleState.Collapsed, skill, skill.id));
                    }
                }
                else {
                    items.push(new SkillsTreeItem(skill.name, vscode.TreeItemCollapsibleState.None, skill, skill.id));
                }
            });
            return Promise.resolve(items);
        }
        else if (element.skill && element.skill.absolutePath) {
            // 展开技能子文件夹（只显示技能文件所在目录的内容）
            const skillDir = path.dirname(element.skill.absolutePath);
            return this.getSkillFolderContents(skillDir, element.skill);
        }
        else if (element.filePath && !element.isFile) {
            // 展开技能子文件夹
            return this.getSkillFolderContents(element.filePath, element.skill);
        }
        return Promise.resolve([]);
    }
    getSkillFolderContents(folderPath, skill) {
        const fs = require('fs');
        const items = [];
        if (!fs.existsSync(folderPath)) {
            return Promise.resolve([]);
        }
        // 如果提供了 skill，检查 folderPath 是否在技能文件夹范围内
        if (skill && skill.absolutePath) {
            const skillRootDir = path.dirname(skill.absolutePath);
            const iflowDir = path.join(skill.projectPath, '.iflow');
            // 只显示技能文件夹内的内容，不允许超出范围
            if (!folderPath.startsWith(skillRootDir) && !folderPath.startsWith(iflowDir)) {
                return Promise.resolve([]);
            }
        }
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        entries.forEach((entry) => {
            const fullPath = path.join(folderPath, entry.name);
            if (entry.isDirectory()) {
                items.push(new SkillsTreeItem(entry.name, vscode.TreeItemCollapsibleState.Collapsed, undefined, undefined, fullPath, false));
            }
            else if (entry.isFile()) {
                items.push(new SkillsTreeItem(entry.name, vscode.TreeItemCollapsibleState.None, undefined, undefined, fullPath, true));
            }
        });
        // 排序：文件夹在前，文件在后
        items.sort((a, b) => {
            if (a.isFile && !b.isFile)
                return 1;
            if (!a.isFile && b.isFile)
                return -1;
            return a.label.localeCompare(b.label);
        });
        return Promise.resolve(items);
    }
}
exports.SkillsTreeDataProvider = SkillsTreeDataProvider;
//# sourceMappingURL=skillsTreeProvider.js.map