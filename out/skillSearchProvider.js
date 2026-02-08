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
exports.SkillSearchProvider = void 0;
const vscode = __importStar(require("vscode"));
class SkillSearchProvider {
    constructor(_extensionUri, skillManager) {
        this._extensionUri = _extensionUri;
        this.skillManager = skillManager;
        this.detailPanels = new Map();
    }
    showSearchPanel() {
        if (this.currentPanel) {
            this.currentPanel.dispose();
            this.currentPanel = undefined;
            setTimeout(() => {
                this.createNewPanel();
            }, 100);
        }
        else {
            this.createNewPanel();
        }
    }
    createNewPanel() {
        this.currentPanel = vscode.window.createWebviewPanel("iflowSkillSearch", "Search Skills Online", vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [this._extensionUri],
        });
        this.currentPanel.webview.html = this.getWebviewContent(this.currentPanel.webview);
        this.currentPanel.onDidDispose(() => {
            this.currentPanel = undefined;
        });
        this.currentPanel.webview.onDidReceiveMessage(async (message) => {
            console.log("收到消息:", message);
            switch (message.command) {
                case "search":
                    await this.handleSearch(message.query, message.sortBy, message.dataSource, message.page);
                    break;
                case "install":
                    await this.handleInstall(message.skill);
                    break;
                case "viewDetail":
                    this.handleViewDetail(message.skill);
                    break;
            }
        }, undefined, void 0);
    }
    async handleSearch(query, sortBy, dataSource, page = 1) {
        try {
            this.currentPanel?.webview.postMessage({
                command: "updateLoading",
                loading: true,
            });
            // 如果指定了数据源，临时更新配置
            if (dataSource) {
                const config = vscode.workspace.getConfiguration("iflow");
                await config.update("skillDataSource", dataSource, true);
            }
            const skills = await this.skillManager.searchSkillsOnline(query, sortBy, 10, // 每页显示10个
            page);
            console.log('searchSkillsOnline returned skills:', skills.length, 'page:', page);
            // 检查哪些技能已安装
            const installedSkills = skills
                .map(skill => {
                const check = this.skillManager.isSkillInstalled(skill.name, skill.url);
                return check.installed && check.sameRepo ? skill.id : null;
            })
                .filter(id => id !== null);
            const hasMore = skills.length === 10; // 如果返回的数量等于请求的数量，可能还有更多
            console.log('Sending updateResults - page:', page, 'hasMore:', hasMore, 'skills:', skills.length);
            this.currentPanel?.webview.postMessage({
                command: "updateResults",
                skills: skills,
                installedSkills: installedSkills,
                page: page,
                hasMore: hasMore,
            });
        }
        catch (error) {
            // 统一错误处理
            const errorMessage = error instanceof Error ? error.message : "搜索失败，请稍后重试";
            this.currentPanel?.webview.postMessage({
                command: "showError",
                error: errorMessage,
            });
        }
    }
    async handleInstall(skill) {
        try {
            console.log("========== 开始安装技能 ==========");
            console.log("Skill ID:", skill.id);
            console.log("Skill Name:", skill.name);
            console.log("Skill URL:", skill.url);
            console.log("Raw Data:", JSON.stringify(skill.rawData, null, 2));
            // 使用进度窗口显示安装过程
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在安装技能: ${skill.name}`,
                cancellable: false,
            }, async (progress) => {
                // 定义进度回调函数
                const progressCallback = (message) => {
                    console.log("安装进度:", message);
                    progress.report({ message: message });
                };
                console.log("准备调用 installSkillFromGitHub...");
                // 调用 SkillManager 的安装方法
                const result = await this.skillManager.installSkillFromGitHub(skill.url, skill.name, skill.rawData, progressCallback);
                console.log("========== 安装结果 ==========");
                console.log("Success:", result.success);
                console.log("Error:", result.error);
                console.log("Already Installed:", result.alreadyInstalled);
                if (result.success) {
                    if (result.alreadyInstalled) {
                        vscode.window.showInformationMessage(`技能 "${skill.name}" 已存在，已更新/覆盖安装。`);
                    }
                    else {
                        vscode.window.showInformationMessage(`技能 "${skill.name}" 安装成功！`);
                    }
                }
                else {
                    throw new Error(result.error || "安装失败");
                }
            });
            this.currentPanel?.webview.postMessage({
                command: "installSuccess",
                skillId: skill.id,
            });
        }
        catch (error) {
            console.error("========== 安装错误 ==========");
            console.error("Error:", error);
            vscode.window.showErrorMessage(`安装失败: ${error instanceof Error ? error.message : "未知错误"}`);
        }
    }
    handleViewDetail(skill) {
        // 检查是否已有打开的详情页面
        const existingPanel = this.detailPanels.get(skill.id);
        if (existingPanel) {
            // 如果已打开，直接显示该页面
            existingPanel.reveal(existingPanel.viewColumn || vscode.ViewColumn.Beside);
            // 更新内容（因为数据可能已更新）
            existingPanel.webview.html = this.getDetailWebviewContent(skill, existingPanel.webview);
            return;
        }
        // 创建新的详情页面
        const detailPanel = vscode.window.createWebviewPanel("iflowSkillDetail", `Skill Details: ${skill.name}`, vscode.ViewColumn.Beside, {
            enableScripts: false,
            retainContextWhenHidden: true,
        });
        detailPanel.webview.html = this.getDetailWebviewContent(skill, detailPanel.webview);
        // 保存到 Map 中
        this.detailPanels.set(skill.id, detailPanel);
        // 当面板关闭时，从 Map 中移除
        detailPanel.onDidDispose(() => {
            this.detailPanels.delete(skill.id);
        });
    }
    getDetailWebviewContent(skill, webview) {
        const rawData = skill.rawData || {};
        // 确保使用正确的数据字段
        const name = skill.name || rawData.name || 'Unknown';
        const author = skill.repository || rawData.author || 'Unknown';
        const description = skill.description || rawData.description || rawData.description_cn || '暂无描述';
        const githubUrl = skill.url || rawData.github_url || '';
        const stars = skill.stars || rawData.stars || 0;
        const forks = skill.forks || rawData.forks || 0;
        const authorAvatar = rawData.author_avatar || '';
        const downloads = rawData.downloads || 0;
        const views = rawData.views || 0;
        const categoryName = rawData.category_name || rawData.categoryName || '';
        const subtagName = rawData.subtag_name || rawData.subtagName || '';
        const updatedAt = skill.updatedAt ? new Date(skill.updatedAt).toLocaleDateString('zh-CN') :
            (rawData.updated_at ? new Date(rawData.updated_at * 1000).toLocaleDateString('zh-CN') : 'Unknown');
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skill Details: ${name}</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 24px;
            line-height: 1.6;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        .header {
            display: flex;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .avatar {
            width: 72px;
            height: 72px;
            border-radius: 12px;
            flex-shrink: 0;
            background-color: var(--vscode-button-secondaryBackground);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
        }

        .header-info {
            flex: 1;
        }

        .title {
            font-size: 32px;
            font-weight: 700;
            color: var(--vscode-foreground);
            margin-bottom: 12px;
            letter-spacing: -0.5px;
        }

        .author {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }

        .author a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-weight: 500;
        }

        .author a:hover {
            text-decoration: underline;
        }

        .badges {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 8px;
        }

        .badge {
            display: inline-flex;
            align-items: center;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .badge-primary {
            background-color: rgba(78, 201, 176, 0.15);
            color: #4ec9b0;
        }

        .github-link {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 6px;
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
            transition: background-color 0.2s;
            margin-right: 10px;
        }

        .github-link:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .github-icon {
            font-size: 16px;
        }

        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 16px;
        }

        .install-btn {
            padding: 10px 20px;
            background-color: var(--vscode-button-primaryBackground);
            color: var(--vscode-button-primaryForeground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        .install-btn:hover {
            background-color: var(--vscode-button-primaryHoverBackground);
        }

        .close-btn {
            padding: 10px 20px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
        }

        .close-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .description-section {
            margin: 30px 0;
            padding: 20px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 8px;
            border-left: 4px solid var(--vscode-textLink-foreground);
        }

        .section-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }

        .description {
            font-size: 15px;
            line-height: 1.7;
            color: var(--vscode-foreground);
            white-space: pre-wrap;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-top: 30px;
        }

        .stat-card {
            padding: 20px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
        }

        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }

        .stat-value {
            font-size: 28px;
            font-weight: 700;
            color: var(--vscode-foreground);
            line-height: 1.2;
        }

        .stat-value.large {
            font-size: 32px;
        }

        .meta-section {
            margin-top: 30px;
            padding: 20px;
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
        }

        .meta-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .meta-row:last-child {
            border-bottom: none;
        }

        .meta-label {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
        }

        .meta-value {
            font-size: 14px;
            color: var(--vscode-foreground);
            font-weight: 500;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            ${authorAvatar ?
            `<img src="${authorAvatar}" class="avatar" alt="${author}" />` :
            `<div class="avatar">${name.charAt(0).toUpperCase()}</div>`}
            <div class="header-info">
                <h1 class="title">${name}</h1>
                <div class="author">
                    <a href="https://github.com/${author}" target="_blank">by ${author}</a>
                </div>
                <div class="badges">
                    ${categoryName ? `<span class="badge">${categoryName}</span>` : ''}
                    ${subtagName ? `<span class="badge">${subtagName}</span>` : ''}
                    <span class="badge badge-primary">SkillMap 市场</span>
                </div>
                <div class="button-group">
                    ${githubUrl ?
            `<a href="${githubUrl}" target="_blank" class="github-link">
                            <span class="github-icon">🔗</span> GitHub
                        </a>` : ''}
                    <button class="install-btn" onclick="window.location.reload()">关闭</button>
                </div>
            </div>
        </div>

        <div class="description-section">
            <div class="section-title">描述</div>
            <div class="description">${description}</div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">⭐ Stars</div>
                <div class="stat-value large">${stars.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">🍴 Forks</div>
                <div class="stat-value">${forks.toLocaleString()}</div>
            </div>
            ${downloads > 0 ? `
            <div class="stat-card">
                <div class="stat-label">⬇️ Downloads</div>
                <div class="stat-value">${downloads.toLocaleString()}</div>
            </div>` : ''}
            ${views > 0 ? `
            <div class="stat-card">
                <div class="stat-label">👁️ Views</div>
                <div class="stat-value">${views.toLocaleString()}</div>
            </div>` : ''}
        </div>

        <div class="meta-section">
            <div class="section-title">元数据</div>
            <div class="meta-row">
                <div class="meta-label">更新时间</div>
                <div class="meta-value">${updatedAt}</div>
            </div>
            ${categoryName ? `
            <div class="meta-row">
                <div class="meta-label">分类</div>
                <div class="meta-value">${categoryName}</div>
            </div>` : ''}
            ${subtagName ? `
            <div class="meta-row">
                <div class="meta-label">子标签</div>
                <div class="meta-value">${subtagName}</div>
            </div>` : ''}
            <div class="meta-row">
                <div class="meta-label">Skill ID</div>
                <div class="meta-value" style="font-family: monospace; font-size: 12px;">${skill.id}</div>
            </div>
        </div>
    </div>
</body>
</html>`;
    }
    getWebviewContent(webview) {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Search Skills Online</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        .header {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .search-options {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            align-items: center;
        }

        .search-box {
            flex: 1;
            min-width: 200px;
            display: flex;
            gap: 10px;
        }

        .search-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            font-size: var(--vscode-font-size);
        }

        .search-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        .sort-select {
            padding: 8px 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            font-size: var(--vscode-font-size);
            cursor: pointer;
        }

        .search-btn {
            padding: 8px 16px;
            background-color: var(--vscode-button-primaryBackground);
            color: var(--vscode-button-primaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
            font-weight: 500;
            transition: background-color 0.2s;
        }

        .search-btn:hover {
            background-color: var(--vscode-button-primaryHoverBackground);
        }

        .search-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .content-area {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .skill-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 16px;
            background-color: var(--vscode-editor-background);
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .skill-card:hover {
            border-color: var(--vscode-textLink-foreground);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .skill-card.installed {
            border-color: #4ec9b0;
            background-color: rgba(78, 201, 176, 0.05);
        }

        .skill-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
            gap: 10px;
        }

        .skill-name {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-foreground);
            margin-bottom: 5px;
        }

        .skill-repo {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .skill-repo a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            padding: 2px 8px;
            border-radius: 3px;
            background-color: var(--vscode-textCodeBlock-background);
            transition: background-color 0.2s;
        }

        .skill-repo a:hover {
            text-decoration: none;
            background-color: var(--vscode-button-secondaryBackground);
        }

        .skill-author {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }

        .installed-badge {
            background-color: rgba(78, 201, 176, 0.2);
            color: #4ec9b0;
            border: 1px solid #4ec9b0;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            text-transform: uppercase;
            margin-left: 8px;
        }

        .skill-stars {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 14px;
            font-weight: 600;
            color: var(--vscode-foreground);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 4px 8px;
            border-radius: 4px;
        }

        .skill-stats {
            display: flex;
            gap: 15px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .stat-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .skill-description {
            font-size: 14px;
            color: var(--vscode-foreground);
            margin-bottom: 12px;
            line-height: 1.5;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .skill-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
        }

        .skill-actions {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-secondaryBackground);
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
        }

        .action-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .install-btn {
            background-color: #4ec9b0;
            color: #1e1e1e;
            border: none;
        }

        .install-btn:hover {
            background-color: #3db892;
        }

        .install-btn:disabled {
            background-color: var(--vscode-descriptionForeground);
            cursor: not-allowed;
            opacity: 0.6;
        }

        .reinstall-btn {
            background-color: #dcdcaa;
            color: #1e1e1e;
            border: none;
        }

        .reinstall-btn:hover {
            background-color: #c9c68a;
        }

        .reinstall-btn:disabled {
            background-color: var(--vscode-descriptionForeground);
            cursor: not-allowed;
            opacity: 0.6;
        }

        .skill-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 40px;
            color: var(--vscode-descriptionForeground);
            min-height: 300px;
        }

        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid var(--vscode-panel-border);
            border-top-color: var(--vscode-button-primaryBackground);
            border-right-color: var(--vscode-button-primaryBackground);
            border-radius: 50%;
            animation: spin 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
            margin-bottom: 20px;
            box-shadow: 0 0 20px rgba(var(--vscode-button-primaryBackground-rgb), 0.1);
        }

        .loading-text {
            font-size: 16px;
            font-weight: 500;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
        }

        .loading-subtext {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            opacity: 0.8;
        }

        .loading-dots {
            display: inline-block;
            animation: dots 1.5s infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @keyframes dots {
            0%, 20% { opacity: 0; }
            40% { opacity: 1; }
            100% { opacity: 0; }
        }

        .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            color: var(--vscode-descriptionForeground);
            text-align: center;
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 15px;
            opacity: 0.5;
        }

        .empty-state-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
        }

        .empty-state-description {
            font-size: 14px;
            max-width: 400px;
        }

        .error-message {
            background-color: rgba(236, 92, 92, 0.1);
            border: 1px solid #ec5c5c;
            border-radius: 4px;
            padding: 12px 16px;
            color: #ec5c5c;
            margin-bottom: 10px;
        }

        .load-more, .no-more {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            gap: 10px;
        }

        .load-more-text, .no-more-text {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }

        .load-more-btn-container {
            display: flex;
            justify-content: center;
            padding: 20px;
        }

        .load-more-btn {
            padding: 10px 30px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-secondaryBorder);
            border-radius: 4px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
            transition: background-color 0.2s;
        }

        .load-more-btn:hover:not(:disabled) {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .load-more-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .no-more {
            padding: 15px;
        }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge-installed {
            background-color: rgba(78, 201, 176, 0.2);
            color: #4ec9b0;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="search-box">
            <input
                type="text"
                id="searchInput"
                class="search-input"
                placeholder="输入关键词搜索技能（例如：python, docker, git）..."
            />
        </div>
        <div class="search-options">
            <select id="dataSourceSelect" class="sort-select">
                <option value="github">GitHub</option>
                <option value="skillmap">SkillMap</option>
            </select>
            <select id="sortSelect" class="sort-select">
                <option value="popular">热度排序</option>
                <option value="latest">最新排序</option>
            </select>
        </div>
        <button id="searchBtn" class="search-btn">搜索</button>
    </div>

    <div id="contentArea" class="content-area">
        <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">搜索 iFlow 技能</div>
            <div class="empty-state-description">
                输入关键词搜索 SkillMap 市场上的技能，找到后可直接安装到全局技能库。
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const sortSelect = document.getElementById('sortSelect');
        const dataSourceSelect = document.getElementById('dataSourceSelect');
        const contentArea = document.getElementById('contentArea');

        // 搜索功能
        function performSearch() {
            const query = searchInput.value.trim();
            const sortBy = sortSelect.value;
            const dataSource = dataSourceSelect.value;

            if (!query) {
                showEmptyState();
                return;
            }

            // 重置分页
            currentPage = 1;
            hasMore = false;
            currentQuery = query;
            currentSortBy = sortBy;
            currentDataSource = dataSource;

            searchBtn.disabled = true;
            showLoading();

            vscode.postMessage({
                command: 'search',
                query: query,
                sortBy: sortBy,
                dataSource: dataSource,
                page: 1
            });
        }

        // 事件委托 - 只添加一次
        let installedSkillsList = [];
        let currentPage = 1;
        let hasMore = false;
        let isLoading = false;
        let currentQuery = '';
        let currentSortBy = 'popular';
        let currentDataSource = 'github';
        let lastLoadTime = 0; // 上次加载时间戳
        
        contentArea.addEventListener('click', function(event) {
            const btn = event.target.closest('button[data-action]');
            if (!btn) return;
            
            const card = btn.closest('.skill-card');
            if (!card || !card.dataset.skillData) return;
            
            const action = btn.dataset.action;
            const skill = JSON.parse(card.dataset.skillData);
            
            console.log('Button clicked:', action, 'Skill:', skill.name);
            console.log('Skill rawData:', skill.rawData);
            
            if (action === 'viewDetail') {
                vscode.postMessage({
                    command: 'viewDetail',
                    skill: skill
                });
            } else if (action === 'installSkill') {
                installSkill(encodeURIComponent(JSON.stringify(skill)));
            } else if (action === 'reinstallSkill') {
                reinstallSkill(encodeURIComponent(JSON.stringify(skill)));
            }
        });

        // 点击加载更多按钮
        function loadMore() {
            console.log('loadMore called - isLoading:', isLoading, 'hasMore:', hasMore, 'currentQuery:', currentQuery);
            
            if (isLoading || !hasMore || !currentQuery) {
                console.log('loadMore blocked - conditions not met');
                return;
            }
            
            // 速率限制：1秒内只查询一次
            const now = Date.now();
            if (now - lastLoadTime < 1000) {
                console.log('loadMore blocked - rate limit');
                return;
            }
            
            console.log('loadMore executing - page:', currentPage + 1);
            lastLoadTime = now;
            isLoading = true;
            currentPage++;
            
            // 更新按钮状态为加载中
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.disabled = true;
                loadMoreBtn.textContent = '加载中...';
            }
            
            const message = {
                command: 'search',
                query: currentQuery,
                sortBy: currentSortBy,
                dataSource: currentDataSource,
                page: currentPage
            };
            console.log('Sending search message:', message);
            vscode.postMessage(message);
        }

        // 回车搜索
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch();
            }
        });

        searchBtn.addEventListener('click', performSearch);

        // 处理来自扩展的消息
        window.addEventListener('message', (event) => {
            const message = event.data;

            switch (message.command) {
                case 'updateLoading':
                    // 只有在第一页搜索时才显示加载状态（清空内容）
                    if (message.loading && currentPage === 1) {
                        showLoading();
                    }
                    break;

                case 'updateResults':
                    console.log('Received updateResults - page:', message.page, 'skills:', message.skills.length, 'hasMore:', message.hasMore);
                    searchBtn.disabled = false;
                    isLoading = false;
                    installedSkillsList = message.installedSkills || [];
                    hasMore = message.hasMore || false;
                    
                    // 如果是第一页，清空内容；否则追加内容
                    if (message.page === 1) {
                        showResults(message.skills, false);
                    } else {
                        showResults(message.skills, true);
                    }
                    
                    // 如果没有更多数据，显示提示
                    if (!hasMore && message.skills.length > 0) {
                        // 移除加载更多按钮容器
                        const loadMoreBtnDiv = document.getElementById('loadMoreBtnDiv');
                        if (loadMoreBtnDiv) {
                            loadMoreBtnDiv.remove();
                        }
                        
                        const noMoreDiv = document.createElement('div');
                        noMoreDiv.className = 'no-more';
                        noMoreDiv.innerHTML = '<div class="no-more-text">没有更多技能了</div>';
                        contentArea.appendChild(noMoreDiv);
                    }
                    
                    // 如果还有更多数据，显示"加载更多"按钮
                    if (hasMore && message.skills.length > 0) {
                        const loadMoreBtnDiv = document.getElementById('loadMoreBtnDiv');
                        if (!loadMoreBtnDiv) {
                            const newDiv = document.createElement('div');
                            newDiv.className = 'load-more-btn-container';
                            newDiv.id = 'loadMoreBtnDiv';
                            newDiv.innerHTML = '<button class="load-more-btn" id="loadMoreBtn">加载更多</button>';
                            contentArea.appendChild(newDiv);
                            
                            // 绑定点击事件
                            document.getElementById('loadMoreBtn').addEventListener('click', loadMore);
                        } else {
                            // 移除旧按钮并重新添加到末尾
                            loadMoreBtnDiv.remove();
                            const newDiv = document.createElement('div');
                            newDiv.className = 'load-more-btn-container';
                            newDiv.id = 'loadMoreBtnDiv';
                            newDiv.innerHTML = '<button class="load-more-btn" id="loadMoreBtn">加载更多</button>';
                            contentArea.appendChild(newDiv);
                            
                            // 绑定点击事件
                            document.getElementById('loadMoreBtn').addEventListener('click', loadMore);
                        }
                    }
                    break;

                case 'showError':
                    searchBtn.disabled = false;
                    showError(message.error);
                    break;

                case 'installSuccess':
                    markAsInstalled(message.skillId);
                    // 更新已安装列表
                    if (!installedSkillsList.includes(message.skillId)) {
                        installedSkillsList.push(message.skillId);
                    }
                    break;
            }
        });

        function showLoading() {
            const sourceText = currentDataSource === 'github' ? 'GitHub' : 'SkillMap 市场';
            contentArea.innerHTML = \`
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在搜索<span class="loading-dots">...</span></div>
                    <div class="loading-subtext">从 \${sourceText} 查找技能</div>
                </div>
            \`;
        }

        function showEmptyState() {
            const sourceText = currentDataSource === 'github' ? 'GitHub' : 'SkillMap 市场';
            contentArea.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">搜索 iFlow 技能</div>
                    <div class="empty-state-description">
                        输入关键词搜索 \${sourceText} 上的 iFlow 技能，按热度或最新时间排序，找到后可直接安装到全局技能库。
                    </div>
                </div>
            \`;
        }

        function showError(error) {
            contentArea.innerHTML = \`
                <div class="error-message">
                    \${error}
                </div>
            \`;
        }

        function showResults(skills, append = false) {
            if (!skills || skills.length === 0) {
                if (!append) {
                    contentArea.innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-state-icon">📭</div>
                            <div class="empty-state-title">未找到相关技能</div>
                            <div class="empty-state-description">
                                尝试使用其他关键词搜索
                            </div>
                        </div>
                    \`;
                }
                return;
            }

            // 使用文档片段来构建 DOM，避免重复添加事件监听器
            const fragment = document.createDocumentFragment();
            
            skills.forEach(skill => {
                const card = document.createElement('div');
                card.className = 'skill-card';
                card.id = 'skill-' + skill.id;
                
                // 将 skill 数据存储在 card 上，避免 HTML 属性解析问题
                card.dataset.skillData = JSON.stringify(skill);
                
                // 检查是否已安装
                const isInstalled = installedSkillsList.includes(skill.id);
                
                // 根据数据源显示不同的来源标签
                const sourceText = currentDataSource === 'github' ? 'GitHub' : 'SkillMap 市场';

                card.innerHTML = \`
                    <div class="skill-header">
                        <div>
                            <div class="skill-name">\${escapeHtml(skill.name)}</div>
                            <div class="skill-repo">
                                <a href="\${skill.url}" target="_blank" title="打开 GitHub 仓库">🔗 GitHub</a>
                                <span class="skill-author">by \${escapeHtml(skill.repository)}</span>
                                \${isInstalled ? '<span class="installed-badge">已安装</span>' : ''}
                            </div>
                        </div>
                        <div class="skill-stars">
                            ⭐ \${skill.stars || 0}
                        </div>
                    </div>
                    <div class="skill-description">\${escapeHtml(skill.description || '暂无描述')}</div>
                    <div class="skill-footer">
                        <div class="skill-meta">
                            来自 \${sourceText}
                        </div>
                        <div class="skill-actions">
                            <button class="action-btn" data-action="viewDetail">
                                查看详情
                            </button>
                            \${isInstalled ? \`
                            <button class="action-btn reinstall-btn" data-action="reinstallSkill">
                                重装
                            </button>
                            \` : \`
                            <button class="action-btn install-btn" data-action="installSkill">
                                安装
                            </button>
                            \`}
                        </div>
                    </div>
                \`;
                
                fragment.appendChild(card);
            });
            
            if (append) {
                // 追加模式：移除"没有更多"提示，然后追加新内容
                const noMoreDiv = document.querySelector('.no-more');
                if (noMoreDiv) {
                    noMoreDiv.remove();
                }
                contentArea.appendChild(fragment);
            } else {
                // 非追加模式：清空内容后添加
                contentArea.innerHTML = '';
                contentArea.appendChild(fragment);
            }
        }

        function installSkill(skillEncoded) {
            console.log('installSkill called with:', skillEncoded);
            const skill = JSON.parse(decodeURIComponent(skillEncoded));
            console.log('Parsed skill:', skill);
            const btn = document.querySelector(\`#skill-\${skill.id} .install-btn\`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = '安装中...';
            }

            vscode.postMessage({
                command: 'install',
                skill: skill
            });
        }

        function viewDetail(skillEncoded) {
            const skill = JSON.parse(decodeURIComponent(skillEncoded));
            vscode.postMessage({
                command: 'viewDetail',
                skill: skill
            });
        }

        function reinstallSkill(skillEncoded) {
            console.log('reinstallSkill called with:', skillEncoded);
            const skill = JSON.parse(decodeURIComponent(skillEncoded));
            console.log('Parsed skill for reinstall:', skill);
            const btn = document.querySelector(\`#skill-\${skill.id} .reinstall-btn\`);
            if (btn) {
                btn.disabled = true;
                btn.textContent = '重装中...';
            }

            vscode.postMessage({
                command: 'install',
                skill: skill
            });
        }

        function markAsInstalled(skillId) {
            const card = document.getElementById(\`skill-\${skillId}\`);
            if (card) {
                card.classList.add('installed');
                
                // 处理安装按钮
                const installBtn = card.querySelector('.install-btn');
                if (installBtn) {
                    installBtn.disabled = true;
                    installBtn.textContent = '已安装';
                }
                
                // 处理重装按钮
                const reinstallBtn = card.querySelector('.reinstall-btn');
                if (reinstallBtn) {
                    reinstallBtn.disabled = false;
                    reinstallBtn.textContent = '重装';
                }
            }
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            if (days === 0) return '今天';
            if (days === 1) return '昨天';
            if (days < 7) return \`\${days}天前\`;
            if (days < 30) return \`\${Math.floor(days / 7)}周前\`;
            if (days < 365) return \`\${Math.floor(days / 30)}个月前\`;
            return \`\${Math.floor(days / 365)}年前\`;
        }

        // 页面加载时自动聚焦搜索框
        searchInput.focus();
    </script>
</body>
</html>`;
    }
    escapeHtml(text) {
        const map = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
}
exports.SkillSearchProvider = SkillSearchProvider;
//# sourceMappingURL=skillSearchProvider.js.map