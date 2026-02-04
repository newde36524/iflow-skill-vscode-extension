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
exports.SkillManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SkillManager {
    constructor(context) {
        this.context = context;
        this.skills = new Map();
        this.skillsPath = path.join(context.globalStorageUri.fsPath, "skills");
        this.globalSkillsPath = path.join(context.globalStorageUri.fsPath, "global-skills");
        this.ensureDirectoriesExist();
        this.loadSkills();
    }
    ensureDirectoriesExist() {
        if (!fs.existsSync(this.skillsPath)) {
            fs.mkdirSync(this.skillsPath, { recursive: true });
        }
        if (!fs.existsSync(this.globalSkillsPath)) {
            fs.mkdirSync(this.globalSkillsPath, { recursive: true });
        }
    }
    loadSkills() {
        // 加载本地技能
        if (!fs.existsSync(this.skillsPath)) {
            return;
        }
        this.skills.clear();
        const files = fs.readdirSync(this.skillsPath);
        files.forEach((file) => {
            if (file.endsWith(".json")) {
                const filePath = path.join(this.skillsPath, file);
                try {
                    const content = fs.readFileSync(filePath, "utf-8");
                    const skill = JSON.parse(content);
                    skill.isGlobal = false; // 本地技能
                    this.skills.set(skill.id, skill);
                }
                catch (error) {
                    console.error(`Error loading skill from ${filePath}:`, error);
                }
            }
        });
        // 加载全局技能
        this.loadGlobalSkills();
    }
    loadGlobalSkills() {
        const config = vscode.workspace.getConfiguration("iflow");
        const globalSkillsDir = config.get("globalSkillsPath") ||
            path.join(process.env.HOME || "", ".iflow", "skills");
        if (!fs.existsSync(globalSkillsDir)) {
            return;
        }
        // 只读取下一级子文件夹内的 SKILL.md 文件（不递归）
        const loadMarkdownFiles = (dir, relativePath = "") => {
            if (!fs.existsSync(dir)) {
                return;
            }
            this.skills.clear();
            const items = fs.readdirSync(dir, { withFileTypes: true });
            items.forEach((item) => {
                const fullPath = path.join(dir, item.name);
                const itemRelativePath = path.join(relativePath, item.name);
                if (item.isDirectory() && relativePath === "") {
                    // 只处理下一级子目录，查找其中的 SKILL.md 文件
                    const skillFilePath = path.join(fullPath, "SKILL.md");
                    if (fs.existsSync(skillFilePath)) {
                        try {
                            const content = fs.readFileSync(skillFilePath, "utf-8");
                            const displayName = itemRelativePath;
                            const version = this.extractVersionFromContent(content);
                            const stats = fs.statSync(skillFilePath);
                            const skill = {
                                id: `global-${this.hashString(skillFilePath)}`,
                                name: displayName,
                                description: this.extractDescription(content) || "Global skill",
                                content: content,
                                projectPath: globalSkillsDir,
                                absolutePath: skillFilePath,
                                createdAt: stats.birthtime.toISOString(),
                                updatedAt: stats.mtime.toISOString(),
                                version: version || 1,
                                syncStatus: "synced",
                                globalVersion: version || 1,
                                isGlobal: true,
                            };
                            this.skills.set(skill.id, skill);
                        }
                        catch (error) {
                            console.error(`Error loading global skill from ${skillFilePath}:`, error);
                        }
                    }
                }
                else if (item.isFile() &&
                    item.name.endsWith(".md") &&
                    relativePath === "") {
                    // 读取根目录下的 .md 文件
                    try {
                        const content = fs.readFileSync(fullPath, "utf-8");
                        const skillName = item.name.replace(".md", "");
                        const displayName = skillName;
                        const version = this.extractVersionFromContent(content);
                        const stats = fs.statSync(fullPath);
                        const skill = {
                            id: `global-${this.hashString(fullPath)}`,
                            name: displayName,
                            description: this.extractDescription(content) || "Global skill",
                            content: content,
                            projectPath: globalSkillsDir,
                            absolutePath: fullPath,
                            createdAt: stats.birthtime.toISOString(),
                            updatedAt: stats.mtime.toISOString(),
                            version: version || 1,
                            syncStatus: "synced",
                            globalVersion: version || 1,
                            isGlobal: true,
                        };
                        this.skills.set(skill.id, skill);
                    }
                    catch (error) {
                        console.error(`Error loading global skill from ${fullPath}:`, error);
                    }
                }
            });
        };
        loadMarkdownFiles(globalSkillsDir);
    }
    reloadSkills() {
        // 清空当前技能列表并重新加载
        this.skills.clear();
        this.loadSkills();
    }
    clearSkills() {
        // 清空当前技能列表
        this.skills.clear();
    }
    extractDescription(content) {
        // 尝试从 markdown 内容中提取描述
        const descMatch = content.match(/##\s*Description\s*\n([\s\S]*?)(?=\n##|$)/i);
        if (descMatch && descMatch[1]) {
            return descMatch[1].trim();
        }
        return null;
    }
    async createSkill(name, description, projectPath) {
        const id = this.generateId(name, projectPath);
        const skill = {
            id,
            name,
            description,
            content: await this.generateSkillContentUsingSkillCreator(name, description, projectPath),
            projectPath,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            syncStatus: "new",
        };
        this.skills.set(id, skill);
        await this.saveSkillToFile(skill);
    }
    generateId(name, projectPath) {
        // 使用项目路径的哈希值来确保唯一性，即使文件夹名称相同但路径不同
        const pathHash = this.hashString(projectPath);
        const sanitizedName = name.toLowerCase().replace(/\s+/g, "-");
        return `${sanitizedName}-${pathHash}-${Date.now()}`;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }
    async generateSkillContentUsingSkillCreator(name, description, projectPath) {
        const projectName = path.basename(projectPath);
        // 使用 skill-creator 技能生成内容
        const skillCreatorPrompt = `Create a comprehensive skill definition for "${name}" with the following details:

Description: ${description}
Project Name: ${projectName}
Project Path: ${projectPath}

Generate a complete skill markdown file that includes:
1. A clear title and description
2. When to use this skill
3. Key capabilities and features
4. Any specific tools or workflows it should handle
5. Example use cases
6. Any constraints or limitations

Format the output as a markdown file ready to be used as an iFlow skill.`;
        try {
            // 调用 iFlow CLI 的 skill-creator 技能
            const { exec } = require("child_process");
            return new Promise((resolve, reject) => {
                exec(`iflow -p "Use the skill-creator skill to ${skillCreatorPrompt.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error("Error calling skill-creator:", error);
                        console.error("stderr:", stderr);
                        // 如果 skill-creator 调用失败，回退到默认模板
                        resolve(this.generateDefaultTemplate(name, description, projectPath));
                    }
                    else if (stdout && stdout.trim()) {
                        resolve(stdout.trim());
                    }
                    else {
                        console.error("No output from skill-creator");
                        resolve(this.generateDefaultTemplate(name, description, projectPath));
                    }
                });
            });
        }
        catch (error) {
            console.error("Failed to use skill-creator:", error);
            return this.generateDefaultTemplate(name, description, projectPath);
        }
    }
    generateDefaultTemplate(name, description, projectPath) {
        const projectName = path.basename(projectPath);
        return `# ${name}

## Description
${description}

## Project
- **Project Name**: ${projectName}
- **Project Path**: \`${projectPath}\`

## Usage
This skill provides specialized knowledge and workflows for the ${projectName} project.

## Key Features
<!-- Add your key features here -->

## Getting Started
<!-- Add getting started instructions here -->

## Documentation
<!-- Add detailed documentation here using Markdown formatting -->
`;
    }
    async updateSkill(skill) {
        skill.updatedAt = new Date().toISOString();
        skill.version += 1;
        skill.syncStatus = "modified";
        this.skills.set(skill.id, skill);
        await this.saveSkillToFile(skill);
        // 保存到项目本地 .iflow/skills 目录
        await this.saveSkillToProject(skill);
    }
    async saveSkillToProject(skill) {
        try {
            const projectSkillsDir = path.join(skill.projectPath, ".iflow", "skills");
            if (!fs.existsSync(projectSkillsDir)) {
                fs.mkdirSync(projectSkillsDir, { recursive: true });
            }
            const skillFilePath = path.join(projectSkillsDir, `${skill.name}.md`);
            const contentWithVersion = this.addVersionToContent(skill.content, skill.version);
            await fs.promises.writeFile(skillFilePath, contentWithVersion, "utf-8");
            // 更新绝对路径
            skill.absolutePath = skillFilePath;
        }
        catch (error) {
            console.error(`Failed to save skill to project: ${error}`);
        }
    }
    async saveSkillToFile(skill) {
        const filePath = path.join(this.skillsPath, `${skill.id}.json`);
        await fs.promises.writeFile(filePath, JSON.stringify(skill, null, 2), "utf-8");
    }
    async saveSkillToFilePublic(skill) {
        await this.saveSkillToFile(skill);
    }
    getSkill(id) {
        return this.skills.get(id);
    }
    getAllSkills() {
        // 返回所有技能，包括本地和全局的
        return Array.from(this.skills.values());
    }
    getLocalSkills() {
        // 只返回本地技能
        return Array.from(this.skills.values()).filter((skill) => !skill.isGlobal);
    }
    getGlobalSkills() {
        // 只返回全局技能
        return Array.from(this.skills.values()).filter((skill) => skill.isGlobal);
    }
    async deleteSkill(id) {
        const filePath = path.join(this.skillsPath, `${id}.json`);
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
        this.skills.delete(id);
    }
    async deleteSkillFromGlobal(id) {
        const skill = this.skills.get(id);
        if (skill && skill.isGlobal && skill.absolutePath) {
            // 删除全局技能文件
            if (fs.existsSync(skill.absolutePath)) {
                await fs.promises.unlink(skill.absolutePath);
                // 检查技能是否在子文件夹内，如果是则删除整个子文件夹
                const config = vscode.workspace.getConfiguration("iflow");
                const globalSkillsDir = config.get("globalSkillsPath") ||
                    path.join(process.env.HOME || "", ".iflow", "skills");
                const relativePath = path.relative(globalSkillsDir, skill.absolutePath);
                const pathParts = relativePath.split(path.sep);
                // 如果技能在子文件夹内（即路径包含子目录）
                if (pathParts.length > 1) {
                    const subfolderPath = path.join(globalSkillsDir, pathParts[0]);
                    // 检查子文件夹是否为空
                    if (fs.existsSync(subfolderPath)) {
                        try {
                            const files = fs.readdirSync(subfolderPath);
                            if (files.length === 0) {
                                // 子文件夹为空，删除它
                                await fs.promises.rmdir(subfolderPath);
                            }
                        }
                        catch (error) {
                            console.error(`Error checking/deleting subfolder ${subfolderPath}:`, error);
                        }
                    }
                }
            }
        }
        this.skills.delete(id);
    }
    async removeSkillFromList(id) {
        // 仅从内存中移除，不删除文件
        this.skills.delete(id);
    }
    async importSkillToGlobal(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            return { success: false, error: "Skill not found" };
        }
        try {
            // Get global iflow skills directory path
            const config = vscode.workspace.getConfiguration("iflow");
            const globalSkillsDir = config.get("globalSkillsPath") ||
                path.join(process.env.HOME || "", ".iflow", "skills");
            if (!fs.existsSync(globalSkillsDir)) {
                fs.mkdirSync(globalSkillsDir, { recursive: true });
            }
            const skillFileName = `${skill.name}.md`;
            const skillFilePath = path.join(globalSkillsDir, skillFileName);
            // Write skill content as markdown file with version marker
            const contentWithVersion = this.addVersionToContent(skill.content, skill.version);
            await fs.promises.writeFile(skillFilePath, contentWithVersion, "utf-8");
            // Update sync status
            skill.globalVersion = skill.version;
            skill.syncStatus = "synced";
            await this.saveSkillToFile(skill);
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return { success: false, error: errorMessage };
        }
    }
    async checkGlobalSkillSyncStatus(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            return;
        }
        const globalSkillInfo = await this.readGlobalSkill(skill.name);
        if (!globalSkillInfo.exists) {
            // 全局skill不存在
            skill.syncStatus = skill.globalVersion ? "outdated" : "new";
        }
        else {
            // 检查全局skill的版本
            const globalContent = globalSkillInfo.content || "";
            const globalVersion = this.extractVersionFromContent(globalContent);
            if (skill.globalVersion === undefined) {
                // 从未同步过
                skill.syncStatus = "new";
            }
            else if (globalVersion > skill.globalVersion) {
                // 全局skill有更新
                skill.syncStatus = "outdated";
            }
            else if (skill.version > skill.globalVersion) {
                // 本地有修改
                skill.syncStatus = "modified";
            }
            else {
                // 已同步
                skill.syncStatus = "synced";
            }
        }
        await this.saveSkillToFile(skill);
    }
    async readGlobalSkill(skillName) {
        const config = vscode.workspace.getConfiguration("iflow");
        const globalSkillsDir = config.get("globalSkillsPath") ||
            path.join(process.env.HOME || "", ".iflow", "skills");
        const skillFilePath = path.join(globalSkillsDir, `${skillName}.md`);
        if (!fs.existsSync(skillFilePath)) {
            return { exists: false };
        }
        try {
            const content = await fs.promises.readFile(skillFilePath, "utf-8");
            const version = this.extractVersionFromContent(content);
            return { exists: true, content, version };
        }
        catch (error) {
            return { exists: false };
        }
    }
    extractVersionFromContent(content) {
        const versionMatch = content.match(/<!--\s*VERSION:\s*(\d+)\s*-->/);
        if (versionMatch && versionMatch[1]) {
            return parseInt(versionMatch[1], 10);
        }
        return 0;
    }
    addVersionToContent(content, version) {
        // 移除现有的版本标记
        let cleanedContent = content.replace(/<!--\s*VERSION:\s*\d+\s*-->\s*\n?/g, "");
        // 在内容开头添加版本标记
        const versionMarker = `<!-- VERSION: ${version} -->\n\n`;
        return versionMarker + cleanedContent;
    }
    getSkillsForProject(projectPath) {
        return this.getAllSkills().filter((skill) => skill.projectPath === projectPath);
    }
}
exports.SkillManager = SkillManager;
//# sourceMappingURL=skillManager.js.map