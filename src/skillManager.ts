import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  projectPath: string;
  absolutePath?: string; // 全局技能的绝对路径
  createdAt: string;
  updatedAt: string;
  version: number;
  globalVersion?: number;
  syncStatus: "synced" | "modified" | "outdated" | "new";
  isGlobal?: boolean; // 标记是否为全局技能
  rawData?: any; // 保存完整的 API 数据
}

export interface ImportResult {
  success: boolean;
  error?: string;
}

export class SkillManager {
  private skillsPath: string;
  private globalSkillsPath: string;
  private skills: Map<string, Skill> = new Map();

  /**
   * 获取跨平台的 iflow 全局技能目录路径
   */
  private static getIflowGlobalSkillsPath(): string {
    const config = vscode.workspace.getConfiguration("iflow");
    // 优先使用配置中的路径
    const configPath = config.get<string>("globalSkillsPath");
    if (configPath) {
      return configPath;
    }

    // 根据不同操作系统确定默认路径
    const platform = process.platform;
    let homeDir: string;

    if (platform === "win32") {
      // Windows: %USERPROFILE%\.iflow\skills
      homeDir = process.env.USERPROFILE || process.env.HOME || "";
    } else {
      // macOS/Linux: ~/.iflow/skills
      homeDir = process.env.HOME || "";
    }

    return path.join(homeDir, ".iflow", "skills");
  }

  constructor(private context: vscode.ExtensionContext) {
    this.skillsPath = path.join(context.globalStorageUri.fsPath, "skills");
    this.globalSkillsPath = path.join(
      context.globalStorageUri.fsPath,
      "global-skills",
    );
    this.ensureDirectoriesExist();
    this.loadSkills();
  }

  async checkIflowInstalled(): Promise<boolean> {
    const { exec } = require("child_process");
    return new Promise((resolve) => {
      exec("iflow --version", (error: any) => {
        resolve(!error);
      });
    });
  }

  private ensureDirectoriesExist() {
    if (!fs.existsSync(this.skillsPath)) {
      fs.mkdirSync(this.skillsPath, { recursive: true });
    }
    if (!fs.existsSync(this.globalSkillsPath)) {
      fs.mkdirSync(this.globalSkillsPath, { recursive: true });
    }
  }

  private loadSkills() {
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
          const skill: Skill = JSON.parse(content);
          skill.isGlobal = false; // 本地技能
          this.skills.set(skill.id, skill);
        } catch (error) {
          console.error(`Error loading skill from ${filePath}:`, error);
        }
      }
    });

    // 加载全局技能
    this.loadGlobalSkills();
  }

  private loadGlobalSkills() {
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

            // 读取 github_url 文件（如果存在）
            const githubUrlPath = path.join(skillDirPath, "github_url");
            let githubUrl = "";
            let rawData: any = {};
            if (fs.existsSync(githubUrlPath)) {
              githubUrl = fs.readFileSync(githubUrlPath, "utf-8").trim();
              rawData.github_url = githubUrl;
            }

            const skill: Skill = {
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
              rawData: rawData,
            };

            this.skills.set(skill.id, skill);
          } catch (error) {
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

          const skill: Skill = {
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
        } catch (error) {
          console.error(`Error loading global skill from ${fullPath}:`, error);
        }
      }
    });
  }

  reloadSkills(): void {
    // 清空当前技能列表并重新加载
    this.skills.clear();
    this.loadSkills();
  }

  clearSkills(): void {
    // 清空当前技能列表
    this.skills.clear();
  }

  async createSkill(
    name: string,
    description: string,
    projectPath: string,
    progressCallback?: (message: string) => void,
  ): Promise<void> {
    if (progressCallback) {
      progressCallback(`正在生成技能 ID...`);
    }

    const id = this.generateId(name, projectPath);

    // 生成技能内容
    const content = await this.generateSkillContentUsingSkillCreator(
      name,
      description,
      projectPath,
      progressCallback,
    );

    if (progressCallback) {
      progressCallback(`正在创建技能对象...`);
    }

    const skill: Skill = {
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
    } else {
      if (progressCallback) {
        progressCallback(`已成功导入到全局技能目录`);
      }
    }

    if (progressCallback) {
      progressCallback(`技能创建完成！`);
    }
  }

  private generateId(name: string, projectPath: string): string {
    // 使用项目路径的哈希值来确保唯一性，即使文件夹名称相同但路径不同
    const pathHash = this.hashString(projectPath);
    const sanitizedName = name.toLowerCase().replace(/\s+/g, "-");
    return `${sanitizedName}-${pathHash}-${Date.now()}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private async generateSkillContentUsingSkillCreator(
    name: string,
    description: string,
    projectPath: string,
    progressCallback?: (message: string) => void,
  ): Promise<string> {
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
        exec(
          `iflow -p "Use the skill-creator skill to ${skillCreatorPrompt.replace(/"/g, '\\"')}"`,
          (error: any, stdout: string, stderr: string) => {
            if (error) {
              console.error("Error calling skill-creator:", error);
              console.error("stderr:", stderr);
              if (progressCallback) {
                progressCallback(`skill-creator 调用失败，使用默认模板...`);
              }
              // 如果 skill-creator 调用失败，回退到默认模板
              resolve(
                this.generateDefaultTemplate(name, description, projectPath),
              );
            } else if (stdout && stdout.trim()) {
              if (progressCallback) {
                progressCallback(`技能内容生成成功！`);
              }
              resolve(stdout.trim());
            } else {
              console.error("No output from skill-creator");
              if (progressCallback) {
                progressCallback(`skill-creator 无输出，使用默认模板...`);
              }
              resolve(
                this.generateDefaultTemplate(name, description, projectPath),
              );
            }
          },
        );
      });
    } catch (error) {
      console.error("Failed to use skill-creator:", error);
      if (progressCallback) {
        progressCallback(`skill-creator 执行失败，使用默认模板...`);
      }
      return this.generateDefaultTemplate(name, description, projectPath);
    }
  }

  private generateDefaultTemplate(
    name: string,
    description: string,
    projectPath: string,
  ): string {
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

  async updateSkill(skill: Skill): Promise<void> {
    skill.updatedAt = new Date().toISOString();
    skill.version += 1;
    skill.syncStatus = "modified";
    this.skills.set(skill.id, skill);
    await this.saveSkillToFile(skill);
    // 保存到项目本地 .iflow/skills 目录
    await this.saveSkillToProject(skill);
  }

  public async saveSkillToProject(skill: Skill): Promise<void> {
    try {
      const projectSkillsDir = path.join(skill.projectPath, ".iflow", "skills");
      if (!fs.existsSync(projectSkillsDir)) {
        fs.mkdirSync(projectSkillsDir, { recursive: true });
      }

      // 使用时间戳确保文件名唯一，避免与已有文件冲突
      const timestamp = Date.now();
      const skillFileName = `${skill.name}_${timestamp}.md`;
      const skillFilePath = path.join(projectSkillsDir, skillFileName);

      const contentWithVersion = this.addVersionToContent(
        skill.content,
        skill.version,
      );
      await fs.promises.writeFile(skillFilePath, contentWithVersion, "utf-8");

      // 更新绝对路径
      skill.absolutePath = skillFilePath;
    } catch (error) {
      console.error(`Failed to save skill to project: ${error}`);
    }
  }

  public async deleteProjectLocalSkill(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (skill && skill.absolutePath) {
      try {
        // 删除项目本地的 skill 文件
        if (fs.existsSync(skill.absolutePath)) {
          await fs.promises.unlink(skill.absolutePath);
          console.log(
            `Deleted project local skill file: ${skill.absolutePath}`,
          );
        }

        // 检查并删除空的 .iflow/skills 目录
        const projectSkillsDir = path.join(
          skill.projectPath,
          ".iflow",
          "skills",
        );
        if (fs.existsSync(projectSkillsDir)) {
          const files = fs.readdirSync(projectSkillsDir);
          if (files.length === 0) {
            await fs.promises.rmdir(projectSkillsDir);
            console.log(
              `Deleted empty project skills directory: ${projectSkillsDir}`,
            );

            // 检查并删除空的 .iflow 目录
            const projectIflowDir = path.join(skill.projectPath, ".iflow");
            if (fs.existsSync(projectIflowDir)) {
              const iflowFiles = fs.readdirSync(projectIflowDir);
              if (iflowFiles.length === 0) {
                await fs.promises.rmdir(projectIflowDir);
                console.log(
                  `Deleted empty .iflow directory: ${projectIflowDir}`,
                );
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to delete project local skill file: ${error}`);
      }
    }
  }

  private async saveSkillToFile(skill: Skill): Promise<void> {
    const filePath = path.join(this.skillsPath, `${skill.id}.json`);
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(skill, null, 2),
      "utf-8",
    );
  }

  public async saveSkillToFilePublic(skill: Skill): Promise<void> {
    await this.saveSkillToFile(skill);
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  getAllSkills(): Skill[] {
    // 返回所有技能，包括本地和全局的
    return Array.from(this.skills.values());
  }

  // 检查技能是否已安装（通过文件夹名称和 github_url 文件）
  isSkillInstalled(skillName: string, githubUrl?: string): { installed: boolean; skill?: Skill; sameRepo?: boolean } {
    const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
    
    // 检查是否存在同名文件夹
    const skillDirPath = path.join(globalSkillsDir, skillName);
    if (!fs.existsSync(skillDirPath)) {
      return { installed: false };
    }
    
    // 检查 github_url 文件
    const githubUrlPath = path.join(skillDirPath, "github_url");
    if (!fs.existsSync(githubUrlPath)) {
      return { installed: true, sameRepo: false };
    }
    
    // 读取存储的 GitHub URL
    const storedUrl = fs.readFileSync(githubUrlPath, "utf-8").trim();
    
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

  getLocalSkills(): Skill[] {
    // 只返回本地技能
    return Array.from(this.skills.values()).filter((skill) => !skill.isGlobal);
  }

  getGlobalSkills(): Skill[] {
    // 只返回全局技能
    return Array.from(this.skills.values()).filter((skill) => skill.isGlobal);
  }

  async deleteSkill(id: string): Promise<void> {
    const filePath = path.join(this.skillsPath, `${id}.json`);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    this.skills.delete(id);
  }

  async deleteSkillFromGlobal(id: string): Promise<void> {
    const skill = this.skills.get(id);
    if (!skill) {
      console.warn(`[deleteSkillFromGlobal] Skill not found: ${id}`);
      return;
    }

    console.log(`[deleteSkillFromGlobal] Deleting skill: ${skill.name}, isGlobal: ${skill.isGlobal}`);

    if (skill.isGlobal && skill.absolutePath) {
      // 获取全局技能目录
      const config = vscode.workspace.getConfiguration("iflow");
      const globalSkillsDir =
        config.get<string>("globalSkillsPath") ||
        path.join(process.env.HOME || "", ".iflow", "skills");

      console.log(`[deleteSkillFromGlobal] Global skills dir: ${globalSkillsDir}`);
      console.log(`[deleteSkillFromGlobal] Skill absolute path: ${skill.absolutePath}`);

      // 计算相对路径
      const relativePath = path.relative(globalSkillsDir, skill.absolutePath);
      const pathParts = relativePath.split(path.sep);

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
          } catch (error) {
            console.error(`[deleteSkillFromGlobal] Error deleting subfolder ${subfolderPath}:`, error);
          }
        } else {
          console.warn(`[deleteSkillFromGlobal] Subfolder not found: ${subfolderPath}`);
        }
      } else {
        // 技能文件直接在全局技能目录的根目录
        console.log(`[deleteSkillFromGlobal] Skill in root, deleting file: ${skill.absolutePath}`);

        if (fs.existsSync(skill.absolutePath)) {
          try {
            await fs.promises.unlink(skill.absolutePath);
            console.log(`[deleteSkillFromGlobal] Successfully deleted file: ${skill.absolutePath}`);
          } catch (error) {
            console.error(`[deleteSkillFromGlobal] Error deleting file ${skill.absolutePath}:`, error);
          }
        } else {
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
      } catch (error) {
        console.error(`[deleteSkillFromGlobal] Error deleting JSON record ${filePath}:`, error);
      }
    } else {
      console.warn(`[deleteSkillFromGlobal] JSON record not found: ${filePath}`);
    }

    // 从内存中删除
    this.skills.delete(id);
    console.log(`[deleteSkillFromGlobal] Removed from memory, total skills: ${this.skills.size}`);
  }

  async removeSkillFromList(id: string): Promise<void> {
    // 仅从内存中移除，不删除文件
    this.skills.delete(id);
  }

  async importSkillToGlobal(skillId: string): Promise<ImportResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      console.error(`[importSkillToGlobal] Skill not found: ${skillId}`);
      return { success: false, error: "Skill not found" };
    }

    try {
      // Get global iflow skills directory path
      const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
      console.log(
        `[importSkillToGlobal] Global skills directory: ${globalSkillsDir}`,
      );

      if (!fs.existsSync(globalSkillsDir)) {
        console.log(
          `[importSkillToGlobal] Creating directory: ${globalSkillsDir}`,
        );
        fs.mkdirSync(globalSkillsDir, { recursive: true });
      }

      const skillFileName = `${skill.name}.md`;
      const skillFilePath = path.join(globalSkillsDir, skillFileName);
      console.log(`[importSkillToGlobal] Skill file path: ${skillFilePath}`);

      // Write skill content as markdown file with version marker
      const contentWithVersion = this.addVersionToContent(
        skill.content,
        skill.version,
      );
      await fs.promises.writeFile(skillFilePath, contentWithVersion, "utf-8");
      console.log(
        `[importSkillToGlobal] Successfully wrote file: ${skillFilePath}`,
      );

      // Update absolute path to point to global file
      skill.absolutePath = skillFilePath;

      // Update sync status
      skill.globalVersion = skill.version;
      skill.syncStatus = "synced";
      await this.saveSkillToFile(skill);
      console.log(
        `[importSkillToGlobal] Successfully imported skill: ${skill.name}`,
      );

      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[importSkillToGlobal] Error importing skill:`, error);
      return { success: false, error: errorMessage };
    }
  }

  async checkGlobalSkillSyncStatus(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return;
    }

    const globalSkillInfo = await this.readGlobalSkill(skill.name);

    if (!globalSkillInfo.exists) {
      // 全局skill不存在
      skill.syncStatus = skill.globalVersion ? "outdated" : "new";
    } else {
      // 检查全局skill的版本
      const globalContent = globalSkillInfo.content || "";
      const globalVersion = this.extractVersionFromContent(globalContent);

      if (skill.globalVersion === undefined) {
        // 从未同步过
        skill.syncStatus = "new";
      } else if (globalVersion > skill.globalVersion) {
        // 全局skill有更新
        skill.syncStatus = "outdated";
      } else if (skill.version > skill.globalVersion) {
        // 本地有修改
        skill.syncStatus = "modified";
      } else {
        // 已同步
        skill.syncStatus = "synced";
      }
    }

    await this.saveSkillToFile(skill);
  }

  async readGlobalSkill(
    skillName: string,
  ): Promise<{ exists: boolean; content?: string; version?: number }> {
    const globalSkillsDir = SkillManager.getIflowGlobalSkillsPath();
    const skillFilePath = path.join(globalSkillsDir, `${skillName}.md`);

    if (!fs.existsSync(skillFilePath)) {
      return { exists: false };
    }

    try {
      const content = await fs.promises.readFile(skillFilePath, "utf-8");
      const version = this.extractVersionFromContent(content);
      return { exists: true, content, version };
    } catch (error) {
      return { exists: false };
    }
  }

  private extractVersionFromContent(content: string): number {
    const versionMatch = content.match(/<!--\s*VERSION:\s*(\d+)\s*-->/);
    if (versionMatch && versionMatch[1]) {
      return parseInt(versionMatch[1], 10);
    }
    return 0;
  }

  private addVersionToContent(content: string, version: number): string {
    // 移除现有的版本标记
    let cleanedContent = content.replace(
      /<!--\s*VERSION:\s*\d+\s*-->\s*\n?/g,
      "",
    );

    // 在内容开头添加版本标记
    const versionMarker = `<!-- VERSION: ${version} -->\n\n`;
    return versionMarker + cleanedContent;
  }

  getSkillsForProject(projectPath: string): Skill[] {
    return this.getAllSkills().filter(
      (skill) => skill.projectPath === projectPath,
    );
  }

  updateSkillInMemory(skill: Skill): void {
    if (skill.id && this.skills.has(skill.id)) {
      this.skills.set(skill.id, skill);
    }
  }

  async readSkillFromFile(skillId: string): Promise<Skill | null> {
    const skill = this.skills.get(skillId);
    if (!skill || !skill.absolutePath) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(skill.absolutePath, "utf-8");
      // 返回更新了内容的 skill 对象
      return {
        ...skill,
        content: content,
      };
    } catch (error) {
      console.error(`Failed to read skill from file: ${error}`);
      return null;
    }
  }

  // 从 SkillMap 技能市场搜索技能
  async searchSkillsFromSkillMap(
    query: string,
    limit: number = 5,
    page: number = 1,
  ): Promise<OnlineSkill[]> {
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

      const data: any = await response.json();

      if (!data.items || data.items.length === 0) {
        return [];
      }

      // 转换为 OnlineSkill 格式，保留完整的 API 数据
      const skills: OnlineSkill[] = [];

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
          createdAt: new Date(
            (item.updated_at || Date.now()) * 1000,
          ).toISOString(),
          updatedAt: new Date(
            (item.updated_at || Date.now()) * 1000,
          ).toISOString(),
          // 保存完整的 API 数据用于详情展示
          rawData: item,
        });
      }

      // API 已经按 stars 排序了，直接返回
      return skills;
    } catch (error) {
      console.error("Error searching skills from SkillMap:", error);
      throw error;
    }
  }

  // 在线搜索技能
  async searchSkillsOnline(
    query: string,
    sortBy: "latest" | "popular" = "popular",
    limit: number = 5,
    page: number = 1,
  ): Promise<OnlineSkill[]> {
    // 使用 SkillMap API 搜索技能
    return await this.searchSkillsFromSkillMap(query, limit, page);
  }

  // 从 GitHub 下载整个仓库并安装技能到全局
  async installSkillFromGitHub(
    githubUrl: string,
    skillName: string,
    progressCallback?: (message: string) => void,
  ): Promise<{ success: boolean; error?: string; alreadyInstalled?: boolean }> {
    try {
      console.log("========== installSkillFromGitHub 开始 ==========");
      console.log("GitHub URL:", githubUrl);
      console.log("Skill Name:", skillName);
      
      // 检查是否已安装
      const installCheck = this.isSkillInstalled(skillName, githubUrl);
      if (installCheck.installed) {
        if (installCheck.sameRepo) {
          console.log("技能已安装且来自相同的 GitHub 仓库，跳过安装");
          return { success: true, alreadyInstalled: true };
        } else {
          console.log("技能已安装但来自不同的 GitHub 仓库");
          // 继续安装，使用新的名称
        }
      }
      
      if (progressCallback) {
        progressCallback("正在解析 GitHub URL...");
      }

      // 解析 GitHub URL
      const urlParts = githubUrl.match(
        /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)/,
      );
      
      console.log("URL 解析结果:", urlParts);
      
      if (!urlParts) {
        const error = `无效的 GitHub URL: ${githubUrl}`;
        console.error("URL 解析失败:", error);
        throw new Error(error);
      }

      const [, owner, repo, branch, targetPath] = urlParts;
      console.log("Owner:", owner);
      console.log("Repo:", repo);
      console.log("Branch:", branch);
      console.log("Target Path:", targetPath);

      // 准备临时目录
      const tempDir = path.join(process.env.TMPDIR || "/tmp", `skill-${Date.now()}`);
      console.log("临时目录:", tempDir);
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
      const sourceDir = path.join(tempDir, targetPath);

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

      // 确保技能名称唯一
      let finalSkillName = skillName;
      let counter = 1;
      while (fs.existsSync(path.join(globalSkillsDir, finalSkillName))) {
        finalSkillName = `${skillName}-${counter}`;
        counter++;
      }

      const skillDirPath = path.join(globalSkillsDir, finalSkillName);
      fs.mkdirSync(skillDirPath, { recursive: true });

      // 复制整个技能目录
      await this.copyDirectory(sourceDir, skillDirPath);

      if (progressCallback) {
        progressCallback("正在保存仓库地址...");
      }

      // 创建 github_url 文件，存储仓库地址
      const githubUrlPath = path.join(skillDirPath, "github_url");
      await fs.promises.writeFile(githubUrlPath, githubUrl, "utf-8");

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
      const skill: Skill = {
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
    } catch (error) {
      console.error("Error installing skill from GitHub:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "安装失败",
      };
    }
  }

  // 克隆 Git 仓库
  private async cloneRepository(
    owner: string,
    repo: string,
    branch: string,
    targetDir: string,
  ): Promise<void> {
    const { execSync } = require("child_process");
    
    try {
      // 先尝试直接克隆
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      console.log("克隆仓库（直接）:", cloneUrl);
      execSync(
        `git clone --depth 1 --single-branch --branch ${branch} "${cloneUrl}" "${targetDir}"`,
        { stdio: "pipe" }
      );
    } catch (error) {
      console.log("直接克隆失败，尝试使用代理");
      // 如果直接克隆失败，使用代理
      try {
        const proxyUrl = `https://gh-proxy.com/https://github.com/${owner}/${repo}.git`;
        console.log("克隆仓库（使用代理）:", proxyUrl);
        execSync(
          `git clone --depth 1 --single-branch --branch ${branch} "${proxyUrl}" "${targetDir}"`,
          { stdio: "pipe" }
        );
      } catch (proxyError) {
        throw new Error(`克隆仓库失败（尝试了直接下载和代理）: ${proxyError instanceof Error ? proxyError.message : "未知错误"}`);
      }
    }
  }

  // 复制整个目录
  private async copyDirectory(source: string, target: string): Promise<void> {
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
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
}

// 在线技能接口
export interface OnlineSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  url: string;
  repository: string;
  stars: number;
  forks: number;
  createdAt: string;
  updatedAt: string;
  rawData?: any; // 保存完整的 API 数据
}
