# iflow-skill-vscode-extension

## Description
A comprehensive VS Code extension for managing iFlow skills. This extension provides a graphical interface to create, edit, view, sync, and manage iFlow skills directly within VS Code. It integrates with the iFlow CLI system to enable seamless skill management across local projects and global skill repositories.

## When to Use This Skill

Use this skill when you need to:
- Create new iFlow skills for your projects
- Edit and update existing skill definitions
- View skill details and content
- Sync skills between local projects and global iFlow skill repository
- Manage skill versions and track sync status
- Navigate and organize skills across multiple projects
- Import/export skills to/from the global iFlow skills directory

## Key Capabilities and Features

### Skill Management
- **Create Skills**: Generate new skills from any project folder with automatic content generation using the skill-creator
- **Edit Skills**: Full-featured markdown editor with live preview, tab support, and auto-save
- **View Skills**: Detailed skill information panel showing version, sync status, and full content
- **Delete Skills**: Remove skills from local lists or delete global skill files
- **Organize Skills**: Automatic grouping by project path with clear visual hierarchy

### Sync and Version Control
- **Sync Status Tracking**: Visual indicators for synced, modified, outdated, and new skills
- **Version Management**: Automatic version increment on edits with version markers in skill files
- **Global Sync**: Import skills to global iFlow directory (~/.iflow/skills/)
- **Sync from Global**: Update local skills from global repository
- **Conflict Detection**: Identifies when local and global versions diverge

### Integration Features
- **iFlow CLI Integration**: Executes iFlow commands for skill creation and updates
- **Cross-Platform Support**: Works on Windows, macOS, and Linux with proper path handling
- **Workspace Integration**: Highlights skills relevant to current workspace
- **Real-time Preview**: Markdown rendering with live preview during editing
- **Progress Tracking**: Visual progress indicators for save and sync operations

### User Interface
- **Tree View**: Dedicated sidebar panel in VS Code for skill navigation
- **Context Menus**: Right-click actions for quick skill operations
- **Detail Panels**: Comprehensive skill information display
- **Status Badges**: Color-coded status indicators (synced, modified, outdated, new)
- **Split View Editor**: Side-by-side editing with markdown preview

## Tools and Workflows

### Primary Workflows

1. **Creating a New Skill**
   - Select "Generate Skill" from the iFlow sidebar
   - Choose a project folder
   - Extension automatically generates skill content using skill-creator
   - Skill is saved locally and imported to global directory

2. **Editing an Existing Skill**
   - Double-click a skill or select "Edit" from context menu
   - Edit content in the markdown editor with live preview
   - Save triggers automatic version increment and sync
   - Temporary local files are cleaned up after successful sync

3. **Syncing Skills**
   - Check sync status via context menu or status indicators
   - Sync from global if local version is outdated
   - Modified skills show visual indicators
   - Version comparison prevents data loss

4. **Managing Global Skills**
   - View all skills including global ones in the tree view
   - Delete global skill files or remove from list
   - Organized separately from local project skills

### Command Palette Commands
- `iflow.generateSkill` - Create new skill for selected folder
- `iflow.refreshSkills` - Reload all skills from disk
- `iflow.clearSkills` - Clear the skills list
- `iflow.showAllSkills` - Quick pick to view/manage all skills
- `iflow.openTerminal` - Open iFlow terminal
- `iflow.checkSyncStatus` - Verify sync status for a skill
- `iflow.syncFromGlobal` - Update skill from global repository
- `iflow.viewSkillDetail` - Open detailed skill information
- `iflow.editSkill` - Open skill in editor
- `iflow.saveSkill` - Import skill to global directory
- `iflow.deleteSkill` - Remove skill from list or delete file
- `iflow.install` - Install iFlow CLI

### File System Operations
- Reads/writes skill metadata in extension's global storage
- Manages project-local skill files in `.iflow/skills/` directory
- Interacts with global skills at `~/.iflow/skills/` (configurable)
- Handles both flat and hierarchical skill organization

## Example Use Cases

### Use Case 1: Project-Specific Skill
A developer working on a React project wants to create a skill that captures project-specific conventions and workflows:
1. Opens the project folder in VS Code
2. Clicks the "Generate Skill" button in the iFlow sidebar
3. Selects the project folder
4. Extension generates a comprehensive skill covering React patterns
5. Skill is automatically available in iFlow CLI for future use

### Use Case 2: Updating an Existing Skill
A team needs to update their API development skill with new authentication patterns:
1. Locates the skill in the iFlow sidebar
2. Double-clicks to open the editor
3. Makes changes to the markdown content
4. Clicks save - version automatically increments
5. Skill syncs to global directory for team access

### Use Case 3: Syncing Skills Across Environments
A developer has outdated skills after working offline:
1. Skills show "待更新" (outdated) status badges
2. Right-clicks the skill and selects "Sync from Global"
3. Local skill updates to match global version
4. Status changes to "已同步" (synced)

### Use Case 4: Managing Global Skills
A user wants to clean up unused global skills:
1. Opens the "全局技能" (Global Skills) category
2. Right-clicks on unwanted skills
3. Chooses "Delete Global Skill File" to remove permanently
4. Or "Remove from List" to hide while keeping the file

## Constraints and Limitations

### Technical Constraints
- Requires VS Code version 1.96.0 or higher
- Depends on iFlow CLI being installed and accessible in PATH
- Uses child_process.exec for CLI integration (may have platform-specific limitations)
- Markdown preview uses external CDN for markdown-it library
- File operations rely on Node.js fs module with async/await

### Functional Limitations
- Skill creation requires iFlow CLI skill-creator to be available
- Falls back to default template if skill-creator fails
- No built-in conflict resolution for simultaneous edits
- Skill names must be unique within a project path
- Global skill path defaults to `~/.iflow/skills/` but can be configured

### Known Behaviors
- Skills are temporarily saved to project's `.iflow/skills/` during editing
- Temporary files are cleaned up after successful sync to global
- Version comparison is based on version markers in skill content
- Sync status is checked on extension activation and on demand
- Tree view refreshes automatically after skill operations

### Best Practices
- Always check sync status before editing to avoid conflicts
- Use descriptive skill names for easier identification
- Save changes before switching contexts to avoid data loss
- Regularly sync from global to stay updated with team changes
- Use the progress indicators to monitor long-running operations

## Project Information

- **Project Name**: iflow-skill-vscode-extension
- **Project Path**: `/Users/jmrx/dev/newde36524/vscode-extension/iflow-extension/iflow-skill-vscode-extension`
- **Version**: 0.2.121
- **Publisher**: zsk
- **Extension ID**: iflow-extension

## Development Notes

### Key Components
- `extension.ts` - Main extension activation and command registration
- `skillManager.ts` - Core skill management logic and file operations
- `skillWebviewProvider.ts` - Webview-based skill editor with markdown preview
- `skillsTreeProvider.ts` - Tree view data provider for skill navigation

### Configuration
- Global skills path can be configured via `iflow.globalSkillsPath` setting
- Uses VS Code's global storage for skill metadata
- Supports cross-platform path handling for Windows, macOS, and Linux

### Dependencies
- `markdown-it` - Markdown parsing and rendering
- VS Code API - Tree views, webviews, file system access
- Node.js modules - `fs`, `path`, `child_process`