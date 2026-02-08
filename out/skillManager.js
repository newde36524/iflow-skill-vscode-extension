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
    /**
     * 获取跨平台的 iflow 全局技能目录路径
     */
    static getIflowGlobalSkillsPath() {
        const config = vscode.workspace.getConfiguration("iflow");
        // 优先使用配置中的路径
        const configPath = config.get("globalSkillsPath");
        if (configPath) {
            return configPath;
        }
        // 根据不同操作系统确定默认路径
        const platform = process.platform;
        let homeDir;
        if (platform === "win32") {
            // Windows: %USERPROFILE%\.iflow\skills
            homeDir = process.env.USERPROFILE || process.env.HOME || "";
        }
        else {
            // macOS/Linux: ~/.iflow/skills
            homeDir = process.env.HOME || "";
        }
        return path.join(homeDir, ".iflow", "skills");
    }
    constructor(context) {
        this.context = context;
        this.skills = new Map();
        this.skillsPath = path.join(context.globalStorageUri.fsPath, "skills");
        this.globalSkillsPath = path.join(context.globalStorageUri.fsPath, "global-skills");
        this.ensureDirectoriesExist();
        this.loadSkills();
    }
    async checkIflowInstalled() {
        const { exec } = require("child_process");
        return new Promise((resolve) => {
            exec("iflow --version", (error) => {
                resolve(!error);
            });
        });
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
        // 加载项目本地 .iflow 文件夹中的技能
        this.loadProjectLocalSkills();
    }
    // 加载项目本地 .iflow 文件夹中的技能
    loadProjectLocalSkills() {
        // 获取当前工作区中的所有项目文件夹
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }
        workspaceFolders.forEach((folder) => {
            const projectPath = folder.uri.fsPath;
            const iflowDir = path.join(projectPath, ".iflow");
            if (!fs.existsSync(iflowDir)) {
                return;
            }
            // 检查 .iflow 目录下的所有文件和文件夹
            const items = fs.readdirSync(iflowDir, { withFileTypes: true });
            items.forEach((item) => {
                const skillId = `project-${this.hashString(iflowDir)}-${item.name}`;
                if (item.isFile() && item.name.toLowerCase() === "skill.md") {
                    // 单个 SKILL.md 文件
                    const skillFilePath = path.join(iflowDir, item.name);
                    this.loadProjectSkillFile(skillFilePath, projectPath, skillId, item.name.replace(".md", ""));
                }
                else if (item.isDirectory()) {
                    // 文件夹，查找其中的 SKILL.md 或 skill.md
                    const skillDirPath = path.join(iflowDir, item.name);
                    let skillFilePath = path.join(skillDirPath, "SKILL.md");
                    if (!fs.existsSync(skillFilePath)) {
                        skillFilePath = path.join(skillDirPath, "skill.md");
                    }
                    if (fs.existsSync(skillFilePath)) {
                        this.loadProjectSkillFile(skillFilePath, projectPath, skillId, item.name);
                    }
                }
            });
        });
    }
    // 加载单个项目技能文件
    loadProjectSkillFile(skillFilePath, projectPath, skillId, skillName) {
        try {
            const content = fs.readFileSync(skillFilePath, "utf-8");
            const stats = fs.statSync(skillFilePath);
            const skillDir = path.dirname(skillFilePath);
            // 读取 description
            const description = content.substring(0, 200).split("\n")[0] || "Project local skill";
            const skill = {
                id: skillId,
                name: skillName,
                description: description,
                content: content,
                projectPath: projectPath,
                absolutePath: skillFilePath,
                createdAt: stats.birthtime.toISOString(),
                updatedAt: stats.mtime.toISOString(),
                version: 1,
                syncStatus: "new",
                isGlobal: false,
                isProjectLocal: true, // 标记为项目本地技能
            };
            this.skills.set(skillId, skill);
            console.log(`Loaded project local skill: ${skillName} from ${skillFilePath}`);
        }
        catch (error) {
            console.error(`Error loading project skill from ${skillFilePath}:`, error);
        }
    }
    loadGlobalSkills() {
        const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
        if (!fs.existsSync(globalSkillsDir)) {
            return;
        }
        // 读取全局技能目录下的所有子文件夹
        const items = fs.readdirSync(globalSkillsDir, { withFileTypes: true });
        items.forEach((item) => {
            if (item.isDirectory()) {
                const skillDirPath = path.join(globalSkillsDir, item.name);
                // 查找 SKILL.md 文件（可能在根目录或子目录中）
                let skillFilePath = path.join(skillDirPath, "SKILL.md");
                // 如果根目录没有 SKILL.md，尝试在 references 或其他子目录中查找
                if (!fs.existsSync(skillFilePath)) {
                    const subdirs = fs.readdirSync(skillDirPath, { withFileTypes: true });
                    for (const subItem of subdirs) {
                        if (subItem.isDirectory()) {
                            const potentialPath = path.join(skillDirPath, subItem.name, "SKILL.md");
                            if (fs.existsSync(potentialPath)) {
                                skillFilePath = potentialPath;
                                break;
                            }
                        }
                    }
                }
                // 如果找到了 SKILL.md 文件，加载该技能
                if (fs.existsSync(skillFilePath)) {
                    try {
                        const content = fs.readFileSync(skillFilePath, "utf-8");
                        const displayName = item.name; // 使用文件夹名称作为技能名称
                        const version = this.extractVersionFromContent(content);
                        const stats = fs.statSync(skillFilePath);
                        // 读取 data.json 文件（如果存在）
                        const dataJsonPath = path.join(skillDirPath, "data.json");
                        let skillData = {};
                        let githubDescription = "";
                        if (fs.existsSync(dataJsonPath)) {
                            try {
                                skillData = JSON.parse(fs.readFileSync(dataJsonPath, "utf-8"));
                                // 从 data.json 中提取描述信息
                                githubDescription = skillData.description_cn || skillData.description || "";
                            }
                            catch (error) {
                                console.error(`Error reading data.json from ${skillDirPath}:`, error);
                            }
                        }
                        const skill = {
                            id: `global-${this.hashString(skillDirPath)}`,
                            name: displayName,
                            description: content.substring(0, 200).split("\n")[0] || "Global skill",
                            content: content,
                            projectPath: skillDirPath,
                            absolutePath: skillFilePath,
                            createdAt: stats.birthtime.toISOString(),
                            updatedAt: stats.mtime.toISOString(),
                            version: version || 1,
                            syncStatus: "synced",
                            globalVersion: version || 1,
                            isGlobal: true,
                            rawData: skillData,
                            githubDescription: githubDescription,
                        };
                        this.skills.set(skill.id, skill);
                    }
                    catch (error) {
                        console.error(`Error loading global skill from ${skillFilePath}:`, error);
                    }
                }
            }
        });
        // 读取根目录下的 .md 文件
        const rootFiles = fs.readdirSync(globalSkillsDir, { withFileTypes: true });
        rootFiles.forEach((item) => {
            if (item.isFile() && item.name.endsWith(".md")) {
                const fullPath = path.join(globalSkillsDir, item.name);
                try {
                    const content = fs.readFileSync(fullPath, "utf-8");
                    const skillName = item.name.replace(".md", "");
                    const displayName = skillName;
                    const version = this.extractVersionFromContent(content);
                    const stats = fs.statSync(fullPath);
                    const skill = {
                        id: `global-${this.hashString(fullPath)}`,
                        name: displayName,
                        description: content.substring(0, 200).split("\n")[0] || "Global skill",
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
    async createSkill(name, description, projectPath, progressCallback) {
        if (progressCallback) {
            progressCallback(`正在生成技能 ID...`);
        }
        const id = this.generateId(name, projectPath);
        // 生成技能内容
        const content = await this.generateSkillContentUsingSkillCreator(name, description, projectPath, progressCallback);
        if (progressCallback) {
            progressCallback(`正在创建技能对象...`);
        }
        const skill = {
            id,
            name,
            description,
            content,
            projectPath,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: 1,
            syncStatus: "new",
        };
        if (progressCallback) {
            progressCallback(`正在保存技能文件...`);
        }
        this.skills.set(id, skill);
        await this.saveSkillToFile(skill);
        // 自动导入到全局目录
        if (progressCallback) {
            progressCallback(`正在导入到全局技能目录...`);
        }
        const importResult = await this.importSkillToGlobal(id);
        if (!importResult.success && importResult.error) {
            console.error(`Failed to import skill to global: ${importResult.error}`);
            if (progressCallback) {
                progressCallback(`导入到全局目录失败: ${importResult.error}`);
            }
        }
        else {
            if (progressCallback) {
                progressCallback(`已成功导入到全局技能目录`);
            }
        }
        if (progressCallback) {
            progressCallback(`技能创建完成！`);
        }
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
    async generateSkillContentUsingSkillCreator(name, description, projectPath, progressCallback) {
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
            if (progressCallback) {
                progressCallback(`正在调用 skill-creator 技能生成内容...`);
            }
            const { exec } = require("child_process");
            return new Promise((resolve, reject) => {
                exec(`iflow -p "Use the skill-creator skill to ${skillCreatorPrompt.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error("Error calling skill-creator:", error);
                        console.error("stderr:", stderr);
                        if (progressCallback) {
                            progressCallback(`skill-creator 调用失败，使用默认模板...`);
                        }
                        // 如果 skill-creator 调用失败，回退到默认模板
                        resolve(this.generateDefaultTemplate(name, description, projectPath));
                    }
                    else if (stdout && stdout.trim()) {
                        if (progressCallback) {
                            progressCallback(`技能内容生成成功！`);
                        }
                        resolve(stdout.trim());
                    }
                    else {
                        console.error("No output from skill-creator");
                        if (progressCallback) {
                            progressCallback(`skill-creator 无输出，使用默认模板...`);
                        }
                        resolve(this.generateDefaultTemplate(name, description, projectPath));
                    }
                });
            });
        }
        catch (error) {
            console.error("Failed to use skill-creator:", error);
            if (progressCallback) {
                progressCallback(`skill-creator 执行失败，使用默认模板...`);
            }
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
            // 使用时间戳确保文件名唯一，避免与已有文件冲突
            const timestamp = Date.now();
            const skillFileName = `${skill.name}_${timestamp}.md`;
            const skillFilePath = path.join(projectSkillsDir, skillFileName);
            const contentWithVersion = this.addVersionToContent(skill.content, skill.version);
            await fs.promises.writeFile(skillFilePath, contentWithVersion, "utf-8");
            // 更新绝对路径
            skill.absolutePath = skillFilePath;
        }
        catch (error) {
            console.error(`Failed to save skill to project: ${error}`);
        }
    }
    async deleteProjectLocalSkill(skillId) {
        const skill = this.skills.get(skillId);
        if (skill && skill.absolutePath) {
            try {
                // 删除项目本地的 skill 文件
                if (fs.existsSync(skill.absolutePath)) {
                    await fs.promises.unlink(skill.absolutePath);
                    console.log(`Deleted project local skill file: ${skill.absolutePath}`);
                }
                // 检查并删除空的 .iflow/skills 目录
                const projectSkillsDir = path.join(skill.projectPath, ".iflow", "skills");
                if (fs.existsSync(projectSkillsDir)) {
                    const files = fs.readdirSync(projectSkillsDir);
                    if (files.length === 0) {
                        await fs.promises.rmdir(projectSkillsDir);
                        console.log(`Deleted empty project skills directory: ${projectSkillsDir}`);
                        // 检查并删除空的 .iflow 目录
                        const projectIflowDir = path.join(skill.projectPath, ".iflow");
                        if (fs.existsSync(projectIflowDir)) {
                            const iflowFiles = fs.readdirSync(projectIflowDir);
                            if (iflowFiles.length === 0) {
                                await fs.promises.rmdir(projectIflowDir);
                                console.log(`Deleted empty .iflow directory: ${projectIflowDir}`);
                            }
                        }
                    }
                }
            }
            catch (error) {
                console.error(`Failed to delete project local skill file: ${error}`);
            }
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
    // 检查技能是否已安装（通过文件夹名称和 data.json 文件）
    isSkillInstalled(skillName, githubUrl) {
        const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
        // 检查是否存在同名文件夹
        const skillDirPath = path.join(globalSkillsDir, skillName);
        if (!fs.existsSync(skillDirPath)) {
            return { installed: false };
        }
        // 检查 data.json 文件
        const dataJsonPath = path.join(skillDirPath, "data.json");
        if (!fs.existsSync(dataJsonPath)) {
            return { installed: true, sameRepo: false };
        }
        // 读取存储的数据
        let storedUrl = "";
        try {
            const data = JSON.parse(fs.readFileSync(dataJsonPath, "utf-8"));
            storedUrl = data.github_url || "";
        }
        catch (error) {
            console.error(`Error reading data.json from ${skillDirPath}:`, error);
            return { installed: true, sameRepo: false };
        }
        // 从已加载的技能中查找对应的技能对象
        const allSkills = this.getAllSkills();
        const skill = allSkills.find(s => s.name === skillName && s.isGlobal);
        // 如果提供了要检查的 URL，检查是否包含在其中
        if (githubUrl) {
            // 检查存储的 URL 是否包含搜索结果的 URL，或者反过来
            if (storedUrl.includes(githubUrl) || githubUrl.includes(storedUrl)) {
                return { installed: true, skill, sameRepo: true };
            }
        }
        // 同名但仓库不同
        return { installed: true, skill, sameRepo: false };
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
        const skill = this.skills.get(id);
        if (!skill) {
            console.warn(`[deleteSkill] Skill not found: ${id}`);
            return;
        }
        // 1. 删除项目本地的 skill 文件
        await this.deleteProjectLocalSkill(id);
        // 2. 删除 JSON 记录文件
        const filePath = path.join(this.skillsPath, `${id}.json`);
        if (fs.existsSync(filePath)) {
            try {
                await fs.promises.unlink(filePath);
                console.log(`[deleteSkill] Successfully deleted JSON record: ${filePath}`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[deleteSkill] Error deleting JSON record ${filePath}:`, error);
                throw new Error(`Failed to delete JSON record: ${errorMessage}`);
            }
        }
        // 3. 从内存中删除
        this.skills.delete(id);
        console.log(`[deleteSkill] Removed from memory, total skills: ${this.skills.size}`);
    }
    async deleteSkillFromGlobal(id) {
        const skill = this.skills.get(id);
        if (!skill) {
            console.warn(`[deleteSkillFromGlobal] Skill not found: ${id}`);
            return;
        }
        console.log(`[deleteSkillFromGlobal] Deleting skill: ${skill.name}, isGlobal: ${skill.isGlobal}`);
        if (skill.isGlobal && skill.absolutePath) {
            // 获取全局技能目录
            const config = vscode.workspace.getConfiguration("iflow");
            const globalSkillsDir = config.get("globalSkillsPath") ||
                path.join(process.env.HOME || process.env.USERPROFILE || "", ".iflow", "skills");
            console.log(`[deleteSkillFromGlobal] Global skills dir: ${globalSkillsDir}`);
            console.log(`[deleteSkillFromGlobal] Skill absolute path: ${skill.absolutePath}`);
            // 标准化路径，确保使用相同的分隔符
            const normalizedGlobalDir = path.normalize(globalSkillsDir);
            const normalizedSkillPath = path.normalize(skill.absolutePath);
            // 计算相对路径
            const relativePath = path.relative(normalizedGlobalDir, normalizedSkillPath);
            const pathParts = relativePath.split(path.sep).filter(p => p && p !== ".");
            console.log(`[deleteSkillFromGlobal] Relative path: ${relativePath}`);
            console.log(`[deleteSkillFromGlobal] Path parts: ${JSON.stringify(pathParts)}`);
            // 如果技能在子文件夹内（即路径包含子目录）
            if (pathParts.length > 1) {
                const subfolderPath = path.join(globalSkillsDir, pathParts[0]);
                console.log(`[deleteSkillFromGlobal] Skill in subfolder, deleting: ${subfolderPath}`);
                // 删除整个子文件夹
                if (fs.existsSync(subfolderPath)) {
                    try {
                        await fs.promises.rm(subfolderPath, { recursive: true, force: true });
                        console.log(`[deleteSkillFromGlobal] Successfully deleted subfolder: ${subfolderPath}`);
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.error(`[deleteSkillFromGlobal] Error deleting subfolder ${subfolderPath}:`, error);
                        throw new Error(`Failed to delete subfolder: ${errorMessage}`);
                    }
                }
                else {
                    console.warn(`[deleteSkillFromGlobal] Subfolder not found: ${subfolderPath}`);
                }
            }
            else {
                // 技能文件直接在全局技能目录的根目录
                console.log(`[deleteSkillFromGlobal] Skill in root, deleting file: ${skill.absolutePath}`);
                if (fs.existsSync(skill.absolutePath)) {
                    try {
                        await fs.promises.unlink(skill.absolutePath);
                        console.log(`[deleteSkillFromGlobal] Successfully deleted file: ${skill.absolutePath}`);
                    }
                    catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.error(`[deleteSkillFromGlobal] Error deleting file ${skill.absolutePath}:`, error);
                        throw new Error(`Failed to delete file: ${errorMessage}`);
                    }
                }
                else {
                    console.warn(`[deleteSkillFromGlobal] File not found: ${skill.absolutePath}`);
                }
            }
        }
        // 删除 JSON 记录文件
        const filePath = path.join(this.skillsPath, `${id}.json`);
        if (fs.existsSync(filePath)) {
            try {
                await fs.promises.unlink(filePath);
                console.log(`[deleteSkillFromGlobal] Successfully deleted JSON record: ${filePath}`);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[deleteSkillFromGlobal] Error deleting JSON record ${filePath}:`, error);
                throw new Error(`Failed to delete JSON record: ${errorMessage}`);
            }
        }
        else {
            console.warn(`[deleteSkillFromGlobal] JSON record not found: ${filePath}`);
        }
        // 从内存中删除
        this.skills.delete(id);
        console.log(`[deleteSkillFromGlobal] Removed from memory, total skills: ${this.skills.size}`);
    }
    async removeSkillFromList(id) {
        // 仅从内存中移除，不删除文件
        this.skills.delete(id);
    }
    async importSkillToGlobal(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            console.error(`[importSkillToGlobal] Skill not found: ${skillId}`);
            return { success: false, error: "Skill not found" };
        }
        try {
            // Get global iflow skills directory path
            const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
            console.log(`[importSkillToGlobal] Global skills directory: ${globalSkillsDir}`);
            if (!fs.existsSync(globalSkillsDir)) {
                console.log(`[importSkillToGlobal] Creating directory: ${globalSkillsDir}`);
                fs.mkdirSync(globalSkillsDir, { recursive: true });
            }
            const skillFileName = `${skill.name}.md`;
            const skillFilePath = path.join(globalSkillsDir, skillFileName);
            console.log(`[importSkillToGlobal] Skill file path: ${skillFilePath}`);
            // Write skill content as markdown file with version marker
            const contentWithVersion = this.addVersionToContent(skill.content, skill.version);
            await fs.promises.writeFile(skillFilePath, contentWithVersion, "utf-8");
            console.log(`[importSkillToGlobal] Successfully wrote file: ${skillFilePath}`);
            // Update absolute path to point to global file
            skill.absolutePath = skillFilePath;
            // Update sync status
            skill.globalVersion = skill.version;
            skill.syncStatus = "synced";
            await this.saveSkillToFile(skill);
            console.log(`[importSkillToGlobal] Successfully imported skill: ${skill.name}`);
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`[importSkillToGlobal] Error importing skill:`, error);
            return { success: false, error: errorMessage };
        }
    }
    // 检查导入是否需要覆盖现有文件
    async checkImportWillOverwrite(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill || !skill.isProjectLocal) {
            return null;
        }
        const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
        const sourcePath = skill.absolutePath;
        const isDirectory = fs.statSync(sourcePath).isDirectory();
        const projectName = path.basename(skill.projectPath);
        if (isDirectory) {
            const targetDir = path.join(globalSkillsDir, `${projectName}-${skill.name}`);
            return { willOverwrite: fs.existsSync(targetDir), targetPath: targetDir };
        }
        else {
            const iflowDir = path.join(skill.projectPath, ".iflow");
            const isRootFile = path.dirname(sourcePath) === iflowDir;
            if (isRootFile) {
                const targetPath = path.join(globalSkillsDir, `${projectName}-SKILL.md`);
                return { willOverwrite: fs.existsSync(targetPath), targetPath: targetPath };
            }
            else {
                const subDirName = path.basename(path.dirname(sourcePath));
                const targetDir = path.join(globalSkillsDir, `${projectName}-${subDirName}`);
                return { willOverwrite: fs.existsSync(targetDir), targetPath: targetDir };
            }
        }
    }
    // 将项目本地技能导入到全局（支持复制整个文件夹）
    async importProjectSkillToGlobal(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill) {
            console.error(`[importProjectSkillToGlobal] Skill not found: ${skillId}`);
            return { success: false, error: "Skill not found" };
        }
        if (!skill.isProjectLocal) {
            return { success: false, error: "This is not a project local skill" };
        }
        try {
            const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
            console.log(`[importProjectSkillToGlobal] Global skills directory: ${globalSkillsDir}`);
            if (!fs.existsSync(globalSkillsDir)) {
                fs.mkdirSync(globalSkillsDir, { recursive: true });
            }
            // 确定源路径（可能是单个文件或文件夹）
            const sourcePath = skill.absolutePath;
            const isDirectory = fs.statSync(sourcePath).isDirectory();
            // 获取项目名称（从项目路径中提取）
            const projectName = path.basename(skill.projectPath);
            let targetDir;
            let targetFileName;
            if (isDirectory) {
                // 如果是文件夹，使用命名规则：项目名称-文件夹名称
                targetDir = path.join(globalSkillsDir, `${projectName}-${skill.name}`);
                // 如果目标已存在，先删除（覆盖）
                if (fs.existsSync(targetDir)) {
                    console.log(`[importProjectSkillToGlobal] Overwriting existing directory: ${targetDir}`);
                    fs.rmSync(targetDir, { recursive: true, force: true });
                }
                // 复制整个文件夹
                await this.copyDirectory(sourcePath, targetDir);
                console.log(`[importProjectSkillToGlobal] Copied directory: ${sourcePath} -> ${targetDir}`);
            }
            else {
                // 如果是单个文件，检查是否在 .iflow 根目录
                const iflowDir = path.join(skill.projectPath, ".iflow");
                const isRootFile = path.dirname(sourcePath) === iflowDir;
                if (isRootFile) {
                    // 在根目录的单个文件，使用命名规则：项目名称-SKILL.md
                    targetFileName = `${projectName}-SKILL.md`;
                    const targetPath = path.join(globalSkillsDir, targetFileName);
                    // 如果目标已存在，直接覆盖
                    if (fs.existsSync(targetPath)) {
                        console.log(`[importProjectSkillToGlobal] Overwriting existing file: ${targetPath}`);
                    }
                    await fs.promises.copyFile(sourcePath, targetPath);
                    console.log(`[importProjectSkillToGlobal] Copied file: ${sourcePath} -> ${targetPath}`);
                }
                else {
                    // 在子文件夹中的文件，使用命名规则：项目名称-子文件夹名称
                    const subDirName = path.basename(path.dirname(sourcePath));
                    targetDir = path.join(globalSkillsDir, `${projectName}-${subDirName}`);
                    // 如果目标已存在，先删除（覆盖）
                    if (fs.existsSync(targetDir)) {
                        console.log(`[importProjectSkillToGlobal] Overwriting existing directory: ${targetDir}`);
                        fs.rmSync(targetDir, { recursive: true, force: true });
                    }
                    await this.copyDirectory(path.dirname(sourcePath), targetDir);
                    console.log(`[importProjectSkillToGlobal] Copied subdirectory: ${path.dirname(sourcePath)} -> ${targetDir}`);
                }
            }
            // 重新加载全局技能
            this.loadGlobalSkills();
            console.log(`[importProjectSkillToGlobal] Successfully imported skill: ${skill.name}`);
            return { success: true };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error(`[importProjectSkillToGlobal] Error importing skill:`, error);
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
        const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
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
    updateSkillInMemory(skill) {
        if (skill.id && this.skills.has(skill.id)) {
            this.skills.set(skill.id, skill);
        }
    }
    async readSkillFromFile(skillId) {
        const skill = this.skills.get(skillId);
        if (!skill || !skill.absolutePath) {
            return null;
        }
        try {
            const content = await fs.promises.readFile(skill.absolutePath, "utf-8");
            // 读取 data.json 文件的 description_cn 字段
            let descriptionCn = "";
            if (skill.isGlobal) {
                // 对于全局技能，data.json 可能在技能目录中
                const skillDir = path.dirname(skill.absolutePath);
                const dataJsonPath = path.join(skillDir, "data.json");
                if (fs.existsSync(dataJsonPath)) {
                    try {
                        const dataJsonContent = await fs.promises.readFile(dataJsonPath, "utf-8");
                        const dataJson = JSON.parse(dataJsonContent);
                        descriptionCn = dataJson.description_cn || "";
                    }
                    catch (error) {
                        console.error(`Failed to read data.json: ${error}`);
                    }
                }
            }
            // 返回更新了内容的 skill 对象
            return {
                ...skill,
                content: content,
                descriptionCn: descriptionCn,
            };
        }
        catch (error) {
            console.error(`Failed to read skill from file: ${error}`);
            return null;
        }
    }
    // 从 SkillMap 技能市场搜索技能
    async searchSkillsFromSkillMap(query, limit = 5, page = 1) {
        try {
            // 使用 SkillMap 官方 API
            const apiUrl = `https://skillmaps.net/v1/skills?q=${encodeURIComponent(query)}&sort=stars&page=${page}&limit=${limit}`;
            const response = await fetch(apiUrl, {
                headers: {
                    Accept: "application/json",
                },
            });
            if (!response.ok) {
                throw new Error(`SkillMap API error: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.items || data.items.length === 0) {
                return [];
            }
            // 转换为 OnlineSkill 格式，保留完整的 API 数据
            const skills = [];
            for (const item of data.items) {
                // 优先使用中文描述
                const description = item.description_cn || item.description || "";
                const authorAvatar = item.author_avatar || "";
                skills.push({
                    id: item.id,
                    name: item.name,
                    description: description,
                    content: `# ${item.name}\n\n${description}`,
                    url: item.github_url || `https://skillmaps.net/market#${item.name}`,
                    repository: item.author || "SkillMap",
                    stars: item.stars || 0,
                    forks: item.forks || 0,
                    createdAt: new Date((item.updated_at || Date.now()) * 1000).toISOString(),
                    updatedAt: new Date((item.updated_at || Date.now()) * 1000).toISOString(),
                    // 保存完整的 API 数据用于详情展示
                    rawData: item,
                });
            }
            // API 已经按 stars 排序了，直接返回
            return skills;
        }
        catch (error) {
            console.error("Error searching skills from SkillMap:", error);
            throw error;
        }
    }
    // 从 GitHub 搜索技能（使用仓库搜索 API）
    async searchSkillsFromGitHub(query, sortBy = "popular", limit = 5, page = 1) {
        try {
            // 构建 GitHub 仓库搜索查询
            // 搜索在名称或描述中包含查询词和 "skill" 的仓库
            const searchQuery = `${query} skill in:name,description`;
            // 确定排序方式
            const sort = sortBy === "popular" ? "stars" : "updated";
            const order = "desc";
            // 计算分页
            const perPage = Math.min(limit, 100);
            const p = page;
            const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=${sort}&order=${order}&per_page=${perPage}&page=${p}`;
            console.log(`GitHub 仓库搜索 API URL: ${apiUrl}`);
            const response = await fetch(apiUrl, {
                headers: {
                    "User-Agent": "iFlow-Skill-Manager",
                    "Accept": "application/vnd.github.v3+json",
                },
            });
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`GitHub API error: ${response.status} - ${errorText}`);
                if (response.status === 403) {
                    throw new Error(`GitHub API 速率限制已超出，请稍后再试（未认证用户限制 60 次/小时）`);
                }
                throw new Error(`GitHub API error: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.items || data.items.length === 0) {
                return [];
            }
            // 转换为 OnlineSkill 格式
            const skills = [];
            for (const item of data.items) {
                // 提取仓库信息
                const owner = item.owner.login;
                const repoName = item.name;
                const stars = item.stargazers_count || 0;
                const forks = item.forks_count || 0;
                const updatedAt = item.updated_at;
                const createdAt = item.created_at;
                const description = item.description || "";
                const defaultBranch = item.default_branch || "main";
                const language = item.language || "";
                // 构建 GitHub URL
                const githubUrl = `https://github.com/${owner}/${repoName}`;
                // 生成唯一的 ID
                const id = `github-${owner}-${repoName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                // 保存完整的原始数据
                const rawData = {
                    github_url: githubUrl,
                    author: owner,
                    author_avatar: item.owner.avatar_url || "",
                    description: description,
                    stars: stars,
                    forks: forks,
                    updated_at: Math.floor(new Date(updatedAt).getTime() / 1000),
                    created_at: Math.floor(new Date(createdAt).getTime() / 1000),
                    default_branch: defaultBranch,
                    language: language,
                    ...item,
                };
                // 确定技能名称（使用仓库名称）
                const skillName = repoName;
                skills.push({
                    id: id,
                    name: skillName,
                    description: description || `从 GitHub 搜索到的技能: ${repoName}`,
                    content: `# ${skillName}\n\n${description}`,
                    url: githubUrl,
                    repository: owner,
                    stars: stars,
                    forks: forks,
                    createdAt: new Date(createdAt).toISOString(),
                    updatedAt: new Date(updatedAt).toISOString(),
                    rawData: rawData,
                });
                // 达到限制数量时停止
                if (skills.length >= limit) {
                    break;
                }
            }
            console.log(`GitHub 搜索返回 ${skills.length} 个技能`);
            return skills;
        }
        catch (error) {
            console.error("Error searching skills from GitHub:", error);
            throw error;
        }
    }
    // 在线搜索技能
    async searchSkillsOnline(query, sortBy = "popular", limit = 5, page = 1) {
        // 获取配置的数据源
        const config = vscode.workspace.getConfiguration("iflow");
        const dataSource = config.get("skillDataSource") || "skillmap";
        console.log(`搜索技能 - 数据源: ${dataSource}, 查询: ${query}, 排序: ${sortBy}, 页码: ${page}`);
        // 根据配置选择数据源
        if (dataSource === "github") {
            return await this.searchSkillsFromGitHub(query, sortBy, limit, page);
        }
        else {
            // 默认使用 SkillMap
            return await this.searchSkillsFromSkillMap(query, limit, page);
        }
    }
    // 从 GitHub 下载整个仓库并安装技能到全局
    async installSkillFromGitHub(githubUrl, skillName, skillData, progressCallback) {
        try {
            console.log("========== installSkillFromGitHub 开始 ==========");
            console.log("GitHub URL:", githubUrl);
            console.log("Skill Name:", skillName);
            // 检查是否已安装
            const installCheck = this.isSkillInstalled(skillName, githubUrl);
            if (installCheck.installed) {
                if (installCheck.sameRepo) {
                    console.log("技能已安装且来自相同的 GitHub 仓库，将进行覆盖安装");
                }
                else {
                    console.log("技能已安装但来自不同的 GitHub 仓库，将创建新的安装");
                    // 继续安装，会创建新的目录
                }
            }
            if (progressCallback) {
                progressCallback("正在解析 GitHub URL...");
            }
            // 解析 GitHub URL
            // 支持两种格式：
            // 1. 完整路径: https://github.com/owner/repo/tree/branch/path
            // 2. 简单仓库: https://github.com/owner/repo
            let owner;
            let repo;
            let branch;
            let targetPath;
            // 先尝试匹配完整路径格式
            const fullPathMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/);
            if (fullPathMatch) {
                console.log("URL 解析结果（完整路径）:", fullPathMatch);
                [, owner, repo, branch, targetPath] = fullPathMatch;
            }
            else {
                // 尝试匹配简单仓库格式
                const repoMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (repoMatch) {
                    console.log("URL 解析结果（简单仓库）:", repoMatch);
                    [, owner, repo] = repoMatch;
                    branch = "main"; // 默认使用 main 分支
                    targetPath = "."; // 默认使用根目录
                }
                else {
                    const error = `无效的 GitHub URL: ${githubUrl}`;
                    console.error("URL 解析失败:", error);
                    throw new Error(error);
                }
            }
            console.log("Owner:", owner);
            console.log("Repo:", repo);
            console.log("Branch:", branch);
            console.log("Target Path:", targetPath);
            // 准备临时目录（使用系统临时目录，兼容 Windows）
            const tempDir = path.join(process.env.TEMP || process.env.TMP || "/tmp", `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
            console.log("临时目录:", tempDir);
            // 确保目标目录不存在（清理可能存在的残留目录）
            if (fs.existsSync(tempDir)) {
                console.log("清理已存在的临时目录:", tempDir);
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            fs.mkdirSync(tempDir, { recursive: true });
            if (progressCallback) {
                progressCallback("正在克隆 GitHub 仓库...");
            }
            // 克隆整个仓库
            await this.cloneRepository(owner, repo, branch, tempDir);
            if (progressCallback) {
                progressCallback("正在定位技能目录...");
            }
            // 定位目标目录
            let sourceDir = "";
            if (targetPath === ".") {
                // 对于简单仓库 URL，查找包含 SKILL.md 的目录
                // 优先查找根目录
                if (fs.existsSync(path.join(tempDir, "SKILL.md"))) {
                    sourceDir = tempDir;
                    console.log("在根目录找到 SKILL.md");
                }
                else {
                    // 查找包含 SKILL.md 的子目录
                    const items = fs.readdirSync(tempDir, { withFileTypes: true });
                    let found = false;
                    for (const item of items) {
                        if (item.isDirectory()) {
                            const subDirPath = path.join(tempDir, item.name);
                            if (fs.existsSync(path.join(subDirPath, "SKILL.md"))) {
                                sourceDir = subDirPath;
                                console.log(`在子目录 ${item.name} 找到 SKILL.md`);
                                found = true;
                                break;
                            }
                        }
                    }
                    if (!found) {
                        throw new Error(`在仓库中未找到 SKILL.md 文件`);
                    }
                }
            }
            else {
                // 对于完整路径 URL，直接使用指定的路径
                sourceDir = path.join(tempDir, targetPath);
            }
            if (!fs.existsSync(sourceDir)) {
                throw new Error(`技能目录不存在: ${sourceDir}`);
            }
            if (progressCallback) {
                progressCallback("正在复制技能文件...");
            }
            // 准备保存路径
            const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
            if (!fs.existsSync(globalSkillsDir)) {
                fs.mkdirSync(globalSkillsDir, { recursive: true });
            }
            // 确定最终的技能名称和目录路径
            let finalSkillName = skillName;
            let skillDirPath = path.join(globalSkillsDir, finalSkillName);
            // 如果技能已安装且来自相同仓库，则覆盖安装
            if (installCheck.installed && installCheck.sameRepo) {
                console.log(`相同仓库，覆盖安装: ${skillDirPath}`);
                if (fs.existsSync(skillDirPath)) {
                    fs.rmSync(skillDirPath, { recursive: true, force: true });
                }
            }
            else if (installCheck.installed && !installCheck.sameRepo) {
                // 技能已安装但来自不同仓库，创建新目录
                console.log(`不同仓库，创建新目录`);
                let counter = 1;
                while (fs.existsSync(skillDirPath)) {
                    finalSkillName = `${skillName}-${counter}`;
                    skillDirPath = path.join(globalSkillsDir, finalSkillName);
                    counter++;
                }
            }
            // 创建技能目录
            fs.mkdirSync(skillDirPath, { recursive: true });
            // 复制整个技能目录
            await this.copyDirectory(sourceDir, skillDirPath);
            if (progressCallback) {
                progressCallback("正在保存仓库地址...");
            }
            // 创建 data.json 文件，存储完整的技能数据
            if (skillData) {
                const dataPath = path.join(skillDirPath, "data.json");
                await fs.promises.writeFile(dataPath, JSON.stringify(skillData, null, 2), "utf-8");
            }
            if (progressCallback) {
                progressCallback("正在清理临时文件...");
            }
            // 清理临时目录
            fs.rmSync(tempDir, { recursive: true, force: true });
            if (progressCallback) {
                progressCallback("正在添加到技能列表...");
            }
            // 读取 SKILL.md 内容
            const skillMdPath = path.join(skillDirPath, "SKILL.md");
            let skillContent = "";
            if (fs.existsSync(skillMdPath)) {
                skillContent = fs.readFileSync(skillMdPath, "utf-8");
            }
            // 创建技能对象并添加到列表
            const skillId = Date.now().toString();
            const skill = {
                id: skillId,
                name: finalSkillName,
                description: skillContent.substring(0, 200) || "从 GitHub 安装的技能",
                content: skillContent || `# ${skillName}\n\n从 GitHub 安装的技能`,
                projectPath: skillDirPath,
                absolutePath: skillMdPath,
                isGlobal: true,
                version: 1,
                globalVersion: 1,
                syncStatus: "synced",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            this.skills.set(skillId, skill);
            return { success: true };
        }
        catch (error) {
            console.error("Error installing skill from GitHub:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "安装失败",
            };
        }
    }
    // 克隆 Git 仓库
    async cloneRepository(owner, repo, branch, targetDir) {
        const { execSync } = require("child_process");
        // 如果目标目录已存在，先删除以避免 git clone 失败
        if (fs.existsSync(targetDir)) {
            console.log("目标目录已存在，正在删除:", targetDir);
            try {
                fs.rmSync(targetDir, { recursive: true, force: true });
                console.log("成功删除目标目录");
            }
            catch (removeError) {
                console.error("删除目标目录失败:", removeError);
                // 即使删除失败也继续尝试，git clone 会给出更具体的错误信息
            }
        }
        try {
            // 先尝试直接克隆
            const cloneUrl = `https://github.com/${owner}/${repo}.git`;
            console.log("克隆仓库（直接）:", cloneUrl);
            execSync(`git clone --depth 1 --single-branch --branch ${branch} "${cloneUrl}" "${targetDir}"`, { stdio: "pipe" });
            console.log("克隆成功");
        }
        catch (error) {
            console.log("直接克隆失败，尝试使用代理");
            // 如果直接克隆失败，使用代理
            try {
                const proxyUrl = `https://gh-proxy.com/https://github.com/${owner}/${repo}.git`;
                console.log("克隆仓库（使用代理）:", proxyUrl);
                execSync(`git clone --depth 1 --single-branch --branch ${branch} "${proxyUrl}" "${targetDir}"`, { stdio: "pipe" });
                console.log("使用代理克隆成功");
            }
            catch (proxyError) {
                // 清理可能残留的目录
                if (fs.existsSync(targetDir)) {
                    console.log("清理克隆失败的残留目录");
                    try {
                        fs.rmSync(targetDir, { recursive: true, force: true });
                    }
                    catch (e) {
                        console.error("清理残留目录失败:", e);
                    }
                }
                throw new Error(`克隆仓库失败（尝试了直接下载和代理）: ${proxyError instanceof Error ? proxyError.message : "未知错误"}`);
            }
        }
    }
    // 复制整个目录
    async copyDirectory(source, target) {
        if (!fs.existsSync(source)) {
            throw new Error(`源目录不存在: ${source}`);
        }
        fs.mkdirSync(target, { recursive: true });
        const items = fs.readdirSync(source);
        for (const item of items) {
            const sourcePath = path.join(source, item);
            const targetPath = path.join(target, item);
            const stat = fs.statSync(sourcePath);
            if (stat.isDirectory()) {
                await this.copyDirectory(sourcePath, targetPath);
            }
            else {
                fs.copyFileSync(sourcePath, targetPath);
            }
        }
    }
}
exports.SkillManager = SkillManager;
//# sourceMappingURL=skillManager.js.map