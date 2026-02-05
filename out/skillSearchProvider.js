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
                    await this.handleSearch(message.query, message.sortBy);
                    break;
                case "install":
                    await this.handleInstall(message.skill);
                    break;
                case "viewDetail":
                    this.handleViewDetail(message.skill);
                    break;
                case "openSettings":
                    await vscode.commands.executeCommand("workbench.action.openSettings", "iflow.githubToken");
                    break;
                case "openGitHubTokens":
                    await vscode.env.openExternal(vscode.Uri.parse("https://github.com/settings/tokens"));
                    break;
            }
        }, undefined, void 0);
    }
    async handleSearch(query, sortBy, dataSource) {
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
            const skills = await this.skillManager.searchSkillsOnline(query, sortBy, 5);
            this.currentPanel?.webview.postMessage({
                command: "updateResults",
                skills: skills,
            });
        }
        catch (error) {
            // 检查是否为认证错误
            const errorMessage = error instanceof Error ? error.message : "搜索失败，请稍后重试";
            if (errorMessage.includes("401") ||
                errorMessage.includes("Unauthorized") ||
                errorMessage.includes("403") ||
                errorMessage.includes("rate limit")) {
                this.currentPanel?.webview.postMessage({
                    command: "showAuthError",
                    error: errorMessage,
                });
            }
            else {
                this.currentPanel?.webview.postMessage({
                    command: "showError",
                    error: errorMessage,
                });
            }
        }
    }
    async handleInstall(skill) {
        try {
            console.log("开始安装技能:", skill.name, skill.url);
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
                // 调用 SkillManager 的安装方法
                const result = await this.skillManager.installSkillFromGitHub(skill.url, skill.name, progressCallback);
                console.log("安装结果:", result);
                if (result.success) {
                    vscode.window.showInformationMessage(`技能 "${skill.name}" 安装成功！`);
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
            console.error("安装错误:", error);
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
        const authorAvatar = rawData.author_avatar || "";
        const downloads = rawData.downloads || 0;
        const views = rawData.views || 0;
        const categoryName = rawData.category_name || "";
        const subtagName = rawData.subtagName || "";
        const descriptionCn = rawData.description_cn || "";
        const description = rawData.description || "";
        return `<!DOCTYPE html>
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

        .header {
            display: flex;
            gap: 20px;
            margin-bottom: 25px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .avatar {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .header-info {
            flex: 1;
        }

        .title {
            font-size: 28px;
            font-weight: bold;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
        }

        .author {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }

        .author a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }

        .author a:hover {
            text-decoration: underline;
        }

        .data-source {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 15px;
        }

        .data-source-badge {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 8px;
            border-radius: 3px;
            font-weight: 500;
        }

        .button-group {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background-color 0.2s;
            white-space: nowrap;
        }

        .btn-primary {
            background-color: var(--vscode-button-primaryBackground);
            color: var(--vscode-button-primaryForeground);
        }

        .btn-primary:hover {
            background-color: var(--vscode-button-primaryHoverBackground);
        }

        .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 25px;
        }

        .info-card {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 15px;
            border-radius: 6px;
            border: 1px solid var(--vscode-panel-border);
        }

        .info-card-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .info-card-value {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .content-section {
            margin-top: 25px;
        }

        .section-title {
            font-size: 18px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .description {
            font-size: 14px;
            color: var(--vscode-foreground);
            line-height: 1.8;
            margin-bottom: 15px;
        }

        .tags {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            margin-top: 10px;
        }

        .tag {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 12px;
            border-radius: 3px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        \${authorAvatar ? \`<img src="\${authorAvatar}" class="avatar" alt="Author Avatar" />\` : ''}
        <div class="header-info">
            <div class="title">\${this.escapeHtml(skill.name)}</div>
            <div class="author">
                作者: <a href="https://github.com/\${this.escapeHtml(skill.repository)}" target="_blank">@\${this.escapeHtml(skill.repository)}</a>
            </div>
            <div class="data-source">
                📍 来源: <span class="data-source-badge">SkillMap 市场</span>
            </div>
            <div class="button-group">
                <button class="btn-primary" id="installBtn">安装</button>
                <button class="btn-secondary" id="closeBtn">关闭</button>
            </div>
        </div>
    </div>

    <div class="info-grid">
        <div class="info-card">
            <div class="info-card-label">Stars</div>
            <div class="info-card-value">⭐ \${skill.stars}</div>
        </div>
        <div class="info-card">
            <div class="info-card-label">Forks</div>
            <div class="info-card-value">🍴 \${skill.forks}</div>
        </div>
        <div class="info-card">
            <div class="info-card-label">下载量</div>
            <div class="info-card-value">📥 \${downloads}</div>
        </div>
        <div class="info-card">
            <div class="info-card-label">浏览量</div>
            <div class="info-card-value">👁️ \${views}</div>
        </div>
    </div>

    <div class="content-section">
        <div class="section-title">技能描述</div>
        <div class="description">
            \${this.escapeHtml(descriptionCn || description)}
        </div>
        \${categoryName || subtagName ? \`
        <div class="tags">
            \${categoryName ? \`<span class="tag">\${this.escapeHtml(categoryName)}</span>\` : ''}
            \${subtagName ? \`<span class="tag">\${this.escapeHtml(subtagName)}</span>\` : ''}
        </div>
        \` : ''}
    </div>

    <script>
        const skillData = ${JSON.stringify(skill)};

        document.getElementById('installBtn').addEventListener('click', function() {
            vscode.postMessage({
                command: 'install',
                skill: skillData
            });
        });

        document.getElementById('closeBtn').addEventListener('click', function() {
            window.close();
        });
    </script>
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

        .auth-error {
            background-color: rgba(255, 152, 0, 0.1);
            border: 1px solid #ff9800;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 15px;
        }

        .auth-error-title {
            font-size: 16px;
            font-weight: bold;
            color: #ff9800;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .auth-error-description {
            font-size: 13px;
            color: var(--vscode-foreground);
            margin-bottom: 15px;
            line-height: 1.5;
        }

        .auth-error-steps {
            font-size: 13px;
            color: var(--vscode-foreground);
            margin-bottom: 15px;
        }

        .auth-error-steps ol {
            margin-left: 20px;
            margin-top: 8px;
        }

        .auth-error-steps li {
            margin-bottom: 5px;
            line-height: 1.4;
        }

        .auth-error-steps code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
        }

        .auth-error-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .auth-btn {
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background-color 0.2s;
            border: none;
        }

        .auth-btn-primary {
            background-color: var(--vscode-button-primaryBackground);
            color: var(--vscode-button-primaryForeground);
        }

        .auth-btn-primary:hover {
            background-color: var(--vscode-button-primaryHoverBackground);
        }

        .auth-btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .auth-btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
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
        const contentArea = document.getElementById('contentArea');

        // 搜索功能
        function performSearch() {
            const query = searchInput.value.trim();
            const sortBy = sortSelect.value;
            const dataSource = 'skillmap'; // 固定使用 SkillMap

            if (!query) {
                showEmptyState();
                return;
            }

            searchBtn.disabled = true;
            showLoading();

            vscode.postMessage({
                command: 'search',
                query: query,
                sortBy: sortBy,
                dataSource: dataSource
            });
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
                    if (message.loading) {
                        showLoading();
                    }
                    break;

                case 'updateResults':
                    searchBtn.disabled = false;
                    showResults(message.skills);
                    break;

                case 'showError':
                    searchBtn.disabled = false;
                    showError(message.error);
                    break;

                case 'showAuthError':
                    searchBtn.disabled = false;
                    showAuthError(message.error);
                    break;

                case 'installSuccess':
                    markAsInstalled(message.skillId);
                    break;
            }
        });

        function showLoading() {
            contentArea.innerHTML = \`
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在搜索<span class="loading-dots">...</span></div>
                    <div class="loading-subtext">从 SkillMap 市场查找技能</div>
                </div>
            \`;
        }

        function showEmptyState() {
            contentArea.innerHTML = \`
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-title">搜索 iFlow 技能</div>
                    <div class="empty-state-description">
                        输入关键词搜索 GitHub 上的 iFlow 技能，按热度或最新时间排序，找到后可直接安装到全局技能库。
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

        function showAuthError(error) {
            contentArea.innerHTML = \`
                <div class="auth-error">
                    <div class="auth-error-title">
                        🔐 需要认证
                    </div>
                    <div class="auth-error-description">
                        GitHub API 请求失败（\${escapeHtml(error)}）。这是由于未配置 GitHub Token 或 Token 无效导致的。
                    </div>
                    <div class="auth-error-steps">
                        <strong>解决方法：</strong>
                        <ol>
                            <li>访问 <a href="https://github.com/settings/tokens" target="_blank" style="color: var(--vscode-textLink-foreground);">GitHub Settings</a></li>
                            <li>点击 "Generate new token (classic)"</li>
                            <li>勾选 <code>public_repo</code> 权限</li>
                            <li>生成 Token 并复制</li>
                            <li>在 VSCode 设置中搜索 <code>iflow.githubToken</code> 并粘贴 Token</li>
                        </ol>
                    </div>
                    <div class="auth-error-actions">
                        <button class="auth-btn auth-btn-primary" onclick="openSettings()">
                            打开设置
                        </button>
                        <button class="auth-btn auth-btn-secondary" onclick="openGitHubTokens()">
                            前往 GitHub 生成 Token
                        </button>
                        <button class="auth-btn auth-btn-secondary" onclick="showEmptyState()">
                            稍后再试
                        </button>
                    </div>
                </div>
            \`;
        }

        function openSettings() {
            vscode.postMessage({
                command: 'openSettings'
            });
        }

        function openGitHubTokens() {
            vscode.postMessage({
                command: 'openGitHubTokens'
            });
        }

        function showResults(skills) {
            if (!skills || skills.length === 0) {
                contentArea.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <div class="empty-state-title">未找到相关技能</div>
                        <div class="empty-state-description">
                            尝试使用其他关键词搜索
                        </div>
                    </div>
                \`;
                return;
            }

            contentArea.innerHTML = skills.map(skill => \`
                <div class="skill-card" id="skill-\${skill.id}">
                    <div class="skill-header">
                        <div>
                            <div class="skill-name">\${escapeHtml(skill.name)}</div>
                            <div class="skill-repo">
                                <a href="\${skill.url}" target="_blank" title="打开 GitHub 仓库">🔗 GitHub</a>
                                <span class="skill-author">by \${escapeHtml(skill.repository)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="skill-description">\${escapeHtml(skill.description || '暂无描述')}</div>
                    <div class="skill-footer">
                        <div class="skill-meta">
                            来自 SkillMap 市场
                        </div>
                        <div class="skill-actions">
                            <button class="action-btn" onclick="viewDetail('\${encodeURIComponent(JSON.stringify(skill))}')">
                                查看详情
                            </button>
                            <button class="action-btn install-btn" onclick="installSkill('\${encodeURIComponent(JSON.stringify(skill))}')">
                                安装
                            </button>
                        </div>
                    </div>
                </div>
            \`).join('');
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

        function markAsInstalled(skillId) {
            const card = document.getElementById(\`skill-\${skillId}\`);
            if (card) {
                card.classList.add('installed');
                const btn = card.querySelector('.install-btn');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = '已安装';
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