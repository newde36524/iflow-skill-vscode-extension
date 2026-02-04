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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillWebviewProvider = void 0;
const vscode = __importStar(require("vscode"));
const markdown_it_1 = __importDefault(require("markdown-it"));
const path = __importStar(require("path"));
class SkillWebviewProvider {
    constructor(_extensionUri, skillManager) {
        this._extensionUri = _extensionUri;
        this.skillManager = skillManager;
        this.md = new markdown_it_1.default({
            html: true,
            linkify: true,
            typographer: true,
        });
    }
    resolveWebviewView(webviewView, context, _token) {
        // This is required by WebviewViewProvider interface
        // We don't need to implement this for our use case
    }
    showSkillEditor(skill) {
        // 只在没有 absolutePath 时才设置（优先保留原有的 absolutePath）
        if (!skill.absolutePath) {
            const path = require("path");
            skill.absolutePath = path.join(skill.projectPath, ".iflow", "skills", `${skill.name}.md`);
        }
        console.log("showSkillEditor - absolutePath:", skill.absolutePath);
        this.currentSkill = skill;
        this.showSkillEditorPanel(skill);
    }
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
        if (platform === "win32") {
            homeDir = process.env.USERPROFILE || process.env.HOME || "";
        }
        else {
            homeDir = process.env.HOME || "";
        }
        return path.join(homeDir, ".iflow", "skills");
    }
    showSkillEditorPanel(skill) {
        // 确保设置了 absolutePath
        if (!skill.absolutePath) {
            const path = require("path");
            skill.absolutePath = path.join(skill.projectPath, ".iflow", "skills", `${skill.name}.md`);
        }
        console.log("showSkillEditorPanel - absolutePath:", skill.absolutePath);
        this.currentSkill = skill;
        if (this.currentPanel) {
            this.currentPanel.dispose();
        }
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        this.currentPanel = vscode.window.createWebviewPanel("iflowSkillEditor", `Edit Skill: ${skill.name}`, column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [this._extensionUri],
        });
        this.currentPanel.webview.html = this.getWebviewContent(skill, this.currentPanel.webview);
        this.currentPanel.onDidChangeViewState((e) => {
            if (e.webviewPanel.visible && this.currentSkill) {
                this.currentPanel.webview.html = this.getWebviewContent(this.currentSkill, this.currentPanel.webview);
            }
        }, undefined, void 0);
        this.currentPanel.onDidDispose(() => {
            this.currentPanel = undefined;
        }, undefined, void 0);
        this.currentPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case "save":
                    await this.handleSave(message.content);
                    break;
                case "preview":
                    this.handlePreview(message.content);
                    break;
            }
        }, undefined, void 0);
    }
    async handleSave(content) {
        if (this.currentSkill && this.currentSkill.absolutePath) {
            try {
                // 直接将编辑后的内容覆盖到绝对路径文件
                const fs = require("fs");
                await fs.promises.writeFile(this.currentSkill.absolutePath, content, "utf-8");
                vscode.window.showInformationMessage("Skill saved successfully!");
            }
            catch (error) {
                console.error("Error saving skill:", error);
                vscode.window.showErrorMessage(`保存失败: ${error}`);
            }
        }
        else {
            vscode.window.showErrorMessage("保存失败: 文件路径不存在");
        }
    }
    addVersionToContent(content, version) {
        // 移除现有的版本标记
        let cleanedContent = content.replace(/<!--\s*VERSION:\s*\d+\s*-->\s*\n?/g, "");
        // 在内容开头添加版本标记
        const versionMarker = `<!-- VERSION: ${version} -->\n\n`;
        return versionMarker + cleanedContent;
    }
    updatePreview(content) {
        if (this.currentPanel) {
            const renderedContent = this.md.render(content);
            const previewElement = this.currentPanel.webview.asWebviewUri(vscode.Uri.parse("data:text/html;charset=utf-8," + encodeURIComponent(renderedContent)));
            // 更新预览区域的内容
            this.currentPanel.webview.postMessage({
                command: "updatePreview",
                content: renderedContent,
            });
        }
    }
    handlePreview(content) {
        if (this.currentPanel) {
            const renderedContent = this.md.render(content);
            // 创建预览面板，在右侧显示
            const previewPanel = vscode.window.createWebviewPanel("iflowSkillPreview", `Preview: ${this.currentSkill?.name || "Skill"}`, vscode.ViewColumn.Beside, {
                enableScripts: false,
                retainContextWhenHidden: true,
            });
            previewPanel.webview.html = this.getPreviewWebviewContent(renderedContent, previewPanel.webview);
        }
    }
    getWebviewContent(skill, webview) {
        const renderedContent = this.md.render(skill.content);
        const statusLabels = {
            synced: "已同步",
            modified: "已修改",
            outdated: "待更新",
            new: "新建",
        };
        const statusColors = {
            synced: "#4ec9b0",
            modified: "#dcdcaa",
            outdated: "#ce9178",
            new: "#569cd6",
        };
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Skill: ${skill.name}</title>
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
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 20px;
        }

        .header-left {
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex: 1;
            min-width: 0;
        }

        .title {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-foreground);
        }

        .skill-path {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
        }

        .skill-meta {
            display: flex;
            gap: 15px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            align-items: center;
        }

        .meta-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .meta-label {
            font-weight: 600;
        }

        .meta-item.buttons {
            margin-left: auto;
            display: flex;
            gap: 8px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .status-badge.synced {
            background-color: rgba(78, 201, 176, 0.2);
            color: #4ec9b0;
            border: 1px solid #4ec9b0;
        }

        .status-badge.modified {
            background-color: rgba(220, 220, 170, 0.2);
            color: #dcdcaa;
            border: 1px solid #dcdcaa;
        }

        .status-badge.outdated {
            background-color: rgba(206, 145, 120, 0.2);
            color: #ce9178;
            border: 1px solid #ce9178;
        }

        .status-badge.new {
            background-color: rgba(86, 156, 214, 0.2);
            color: #569cd6;
            border: 1px solid #569cd6;
        }

        .button-group {
            display: flex;
            gap: 10px;
            align-items: center;
            flex-shrink: 0;
        }

        button {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
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

        .content-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        #editor-container {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        #editor {
            flex: 1;
            border: none;
            outline: none;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            padding: 20px;
            resize: none;
            line-height: 1.6;
            overflow: auto;
        }

        #preview {
            flex: 1;
            padding: 20px;
            overflow: auto;
            background-color: var(--vscode-editor-background);
            border-left: 1px solid var(--vscode-panel-border);
        }

        #preview.hidden {
            display: none;
        }

        .markdown-preview {
            line-height: 1.6;
        }

        .markdown-preview h1 {
            font-size: 2em;
            font-weight: bold;
            margin: 0.67em 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }

        .markdown-preview h2 {
            font-size: 1.5em;
            font-weight: bold;
            margin: 0.83em 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }

        .markdown-preview h3 {
            font-size: 1.17em;
            font-weight: bold;
            margin: 1em 0;
        }

        .markdown-preview p {
            margin: 1em 0;
        }

        .markdown-preview code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }

        .markdown-preview pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1em 0;
        }

        .markdown-preview pre code {
            background-color: transparent;
            padding: 0;
        }

        .markdown-preview ul, .markdown-preview ol {
            margin: 1em 0;
            padding-left: 2em;
        }

        .markdown-preview li {
            margin: 0.5em 0;
        }

        .markdown-preview blockquote {
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding-left: 1em;
            margin: 1em 0;
            color: var(--vscode-descriptionForeground);
        }

        .markdown-preview a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }

        .markdown-preview a:hover {
            text-decoration: underline;
        }

        .markdown-preview table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }

        .markdown-preview th, .markdown-preview td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px 12px;
            text-align: left;
        }

        .markdown-preview th {
            background-color: var(--vscode-editor-selectionBackground);
            font-weight: bold;
        }

        .info-bar {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-top: 1px solid var(--vscode-panel-border);
            margin-top: 10px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .sync-progress {
            margin-top: 10px;
            padding: 10px;
            background-color: var(--vscode-editor-selectionBackground);
            border-radius: 4px;
            border: 1px solid var(--vscode-panel-border);
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background-color: var(--vscode-editor-background);
            border-radius: 2px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .progress-fill {
            height: 100%;
            background-color: var(--vscode-button-primaryBackground);
            width: 0%;
            transition: width 0.3s ease;
        }

        .progress-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .split-view {
            width: 100%;
        }

        .full-view {
            width: 100%;
        }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.2/dist/markdown-it.min.js"></script>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <div class="title">${this.escapeHtml(skill.name)}</div>
            <div class="skill-path">${this.escapeHtml(skill.absolutePath || "未知路径")}</div>
            <div class="skill-meta">
                <div class="meta-item">
                    <span class="meta-label">版本:</span>
                    <span>v${skill.version}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">全局版本:</span>
                    <span>v${skill.globalVersion ?? "未同步"}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">状态:</span>
                    <span class="status-badge ${skill.syncStatus}">${statusLabels[skill.syncStatus] || skill.syncStatus}</span>
                </div>
                <div class="meta-item buttons">
                    <button class="btn-secondary" id="previewBtn">隐藏预览</button>
                    <button class="btn-secondary" id="saveBtn">保存</button>
                </div>
            </div>
            <div class="sync-progress" id="syncProgress" style="display: none;">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill"></div>
                </div>
                <div class="progress-text" id="progressText">准备同步...</div>
            </div>
        </div>
    </div>
    
    <div class="content-area">
        <div id="editor-container" class="split-view">
            <textarea id="editor" placeholder="在这里输入skill内容，使用Markdown格式...">${this.escapeHtml(skill.content)}</textarea>
            <div id="preview" class="markdown-preview">
                ${renderedContent}
            </div>
        </div>
    </div>
    
    <div class="info-bar">
        <span>创建时间: ${new Date(skill.createdAt).toLocaleString()}</span>
        <span>最后更新: ${new Date(skill.updatedAt).toLocaleString()}</span>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const editor = document.getElementById('editor');
        const preview = document.getElementById('preview');
        const previewBtn = document.getElementById('previewBtn');
        const saveBtn = document.getElementById('saveBtn');
        const editorContainer = document.getElementById('editor-container');
        const statusBadge = document.querySelector('.status-badge');
        
        let isSplitView = true;
        let isModified = false;
        const initialContent = editor.value;
        
        // Toggle preview
        previewBtn.addEventListener('click', () => {
            if (isSplitView) {
                preview.classList.add('hidden');
                editorContainer.classList.remove('split-view');
                editorContainer.classList.add('full-view');
                previewBtn.textContent = '显示预览';
            } else {
                preview.classList.remove('hidden');
                editorContainer.classList.remove('full-view');
                editorContainer.classList.add('split-view');
                previewBtn.textContent = '隐藏预览';
            }
            isSplitView = !isSplitView;
        });
        
        // Save skill
        saveBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'save',
                content: editor.value
            });
        });

        // Auto-save on blur
        editor.addEventListener('blur', () => {
            vscode.postMessage({
                command: 'save',
                content: editor.value
            });
        });
        
        // Tab key support
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 4;
            }
        });
        
        // Update preview on input
        editor.addEventListener('input', () => {
            // 实时更新预览
            const md = window.markdownit({
                html: true,
                linkify: true,
                typographer: true
            });
            const renderedContent = md.render(editor.value);
            preview.innerHTML = renderedContent;
            
            // 检测内容是否被修改
            if (editor.value !== initialContent && !isModified) {
                isModified = true;
                if (statusBadge) {
                    statusBadge.className = 'status-badge modified';
                    statusBadge.textContent = '已修改';
                }
            } else if (editor.value === initialContent && isModified) {
                isModified = false;
                if (statusBadge) {
                    statusBadge.className = 'status-badge synced';
                    statusBadge.textContent = '已同步';
                }
            }
        });
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updatePreview') {
                preview.innerHTML = message.content;
            } else if (message.command === 'updateSyncProgress') {
                const syncProgress = document.getElementById('syncProgress');
                const progressFill = document.getElementById('progressFill');
                const progressText = document.getElementById('progressText');
                
                if (syncProgress && progressFill && progressText) {
                    syncProgress.style.display = 'block';
                    progressFill.style.width = message.progress + '%';
                    progressText.textContent = message.message;
                }
            } else if (message.command === 'hideSyncProgress') {
                const syncProgress = document.getElementById('syncProgress');
                if (syncProgress) {
                    syncProgress.style.display = 'none';
                }
            } else if (message.command === 'updateSyncStatus') {
                const statusBadge = document.querySelector('.status-badge');
                if (statusBadge) {
                    statusBadge.className = 'status-badge ' + message.status;
                    statusBadge.textContent = message.statusLabel;
                }
            } else if (message.command === 'updateInitialContent') {
                initialContent = message.content;
                isModified = false;
            }
        });
    </script>
</body>
</html>`;
    }
    getPreviewWebviewContent(renderedContent, webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Skill Preview</title>
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

        .markdown-preview h1 {
            font-size: 2em;
            font-weight: bold;
            margin: 0.67em 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }

        .markdown-preview h2 {
            font-size: 1.5em;
            font-weight: bold;
            margin: 0.83em 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 0.3em;
        }

        .markdown-preview h3 {
            font-size: 1.17em;
            font-weight: bold;
            margin: 1em 0;
        }

        .markdown-preview p {
            margin: 1em 0;
        }

        .markdown-preview code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }

        .markdown-preview pre {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1em 0;
        }

        .markdown-preview pre code {
            background-color: transparent;
            padding: 0;
        }

        .markdown-preview ul, .markdown-preview ol {
            margin: 1em 0;
            padding-left: 2em;
        }

        .markdown-preview li {
            margin: 0.5em 0;
        }

        .markdown-preview blockquote {
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding-left: 1em;
            margin: 1em 0;
            color: var(--vscode-descriptionForeground);
        }

        .markdown-preview a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }

        .markdown-preview a:hover {
            text-decoration: underline;
        }

        .markdown-preview table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }

        .markdown-preview th, .markdown-preview td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px 12px;
            text-align: left;
        }

        .markdown-preview th {
            background-color: var(--vscode-editor-selectionBackground);
            font-weight: bold;
        }

        .back-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 8px 16px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            z-index: 1000;
        }
    </style>
</head>
<body>
    <button class="back-btn" onclick="location.reload()">Back to Editor</button>
    <div class="markdown-preview">
        ${renderedContent}
    </div>
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
exports.SkillWebviewProvider = SkillWebviewProvider;
//# sourceMappingURL=skillWebviewProvider.js.map