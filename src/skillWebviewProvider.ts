import * as vscode from 'vscode';
import MarkdownIt from 'markdown-it';
import { SkillManager, Skill } from './skillManager';

export class SkillWebviewProvider implements vscode.WebviewViewProvider {
    private md: MarkdownIt;
    private currentPanel?: vscode.WebviewPanel;
    private currentSkill?: Skill;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly skillManager: SkillManager
    ) {
        this.md = new MarkdownIt({
            html: true,
            linkify: true,
            typographer: true
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        // This is required by WebviewViewProvider interface
        // We don't need to implement this for our use case
    }

    showSkillEditor(skill: Skill) {
        this.currentSkill = skill;
        this.showSkillEditorPanel(skill);
    }

    public showSkillEditorPanel(skill: Skill) {
        if (this.currentPanel) {
            this.currentPanel.dispose();
        }

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        this.currentPanel = vscode.window.createWebviewPanel(
            'iflowSkillEditor',
            `Edit Skill: ${skill.name}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this._extensionUri]
            }
        );

        this.currentPanel.webview.html = this.getWebviewContent(skill, this.currentPanel.webview);

        this.currentPanel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible && this.currentSkill) {
                    this.currentPanel!.webview.html = this.getWebviewContent(this.currentSkill, this.currentPanel!.webview);
                }
            },
            undefined,
            void 0
        );

        this.currentPanel.onDidDispose(
            () => {
                this.currentPanel = undefined;
            },
            undefined,
            void 0
        );

        this.currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'save':
                        await this.handleSave(message.content);
                        break;
                    case 'saveAndImport':
                        await this.handleSaveAndImport(message.content);
                        break;
                    case 'preview':
                        this.handlePreview(message.content);
                        break;
                }
            },
            undefined,
            void 0
        );
    }

    private async handleSave(content: string) {
        if (this.currentSkill) {
            this.currentSkill.content = content;
            await this.skillManager.updateSkill(this.currentSkill);
            
            // 同时保存到全局 ~/.iflow/skills/ 目录
            const result = await this.skillManager.importSkillToGlobal(this.currentSkill.id);
            if (result.success) {
                vscode.window.showInformationMessage('Skill saved successfully!');
            } else {
                vscode.window.showWarningMessage(`Skill saved locally, but failed to save to global directory: ${result.error}`);
            }
        }
    }

    private async handleSaveAndImport(content: string) {
        if (this.currentSkill) {
            this.currentSkill.content = content;
            await this.skillManager.updateSkill(this.currentSkill);
            
            const result = await this.skillManager.importSkillToGlobal(this.currentSkill.id);
            if (result.success) {
                vscode.window.showInformationMessage('Skill saved and imported to global iFlow!');
            } else {
                vscode.window.showErrorMessage(`Failed to import skill: ${result.error}`);
            }
        }
    }

    private handlePreview(content: string) {
        if (this.currentPanel) {
            const renderedContent = this.md.render(content);
            
            // 创建预览面板，在右侧显示
            const previewPanel = vscode.window.createWebviewPanel(
                'iflowSkillPreview',
                `Preview: ${this.currentSkill?.name || 'Skill'}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: false,
                    retainContextWhenHidden: true
                }
            );

            previewPanel.webview.html = this.getPreviewWebviewContent(renderedContent, previewPanel.webview);
        }
    }

    private getWebviewContent(skill: Skill, webview: vscode.Webview): string {
        const renderedContent = this.md.render(skill.content);
        const statusLabels: Record<string, string> = {
            'synced': '已同步',
            'modified': '已修改',
            'outdated': '待更新',
            'new': '新建'
        };
        const statusColors: Record<string, string> = {
            'synced': '#4ec9b0',
            'modified': '#dcdcaa',
            'outdated': '#ce9178',
            'new': '#569cd6'
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
        }

        .header-left {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .title {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-foreground);
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
        }

        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s;
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

        .split-view {
            width: 100%;
        }

        .full-view {
            width: 100%;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <div class="title">${this.escapeHtml(skill.name)}</div>
            <div class="skill-meta">
                <div class="meta-item">
                    <span class="meta-label">版本:</span>
                    <span>v${skill.version}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">全局版本:</span>
                    <span>v${skill.globalVersion ?? '未同步'}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">状态:</span>
                    <span class="status-badge ${skill.syncStatus}">${statusLabels[skill.syncStatus] || skill.syncStatus}</span>
                </div>
            </div>
        </div>
        <div class="button-group">
            <button class="btn-secondary" id="previewBtn">预览</button>
            <button class="btn-secondary" id="saveBtn">保存</button>
            <button class="btn-primary" id="saveAndImportBtn">保存并导入</button>
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
        const saveAndImportBtn = document.getElementById('saveAndImportBtn');
        const editorContainer = document.getElementById('editor-container');
        
        let isSplitView = true;
        
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
        
        // Save and import skill
        saveAndImportBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'saveAndImport',
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
            // Could implement live preview here if needed
        });
    </script>
</body>
</html>`;
    }

    private getPreviewWebviewContent(renderedContent: string, webview: vscode.Webview): string {
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

    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}