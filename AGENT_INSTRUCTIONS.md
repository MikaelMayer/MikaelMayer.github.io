# 🤖 Agent Web App Creation Instructions

## Quick Preview Setup

When creating HTML/JavaScript web applications, use one of these approaches for instant preview:

### Option 1: Direct Preview File
Create or update `preview.html` in the workspace root. This will be automatically served at:
- **Local Preview**: `http://localhost:8000/preview` (when preview server is running)
- **Direct Access**: `file:///workspace/preview.html`

### Option 2: Agent Preview Tool
Use the enhanced preview tool at `/agent-preview.html` which provides:
- Tabbed editor (HTML/CSS/JS)
- Live preview iframe
- Auto-save functionality
- Template system
- Share URLs

### Option 3: Overwrite html.html
Replace the content in `/workspace/html.html` for immediate testing (original concept).

## Instructions for Agents

When asked to create a web application:

1. **Choose the right approach**:
   - For simple single-file apps → Use `preview.html`
   - For complex apps with separate CSS/JS → Use `agent-preview.html`
   - For testing/iteration → Use `html.html`

2. **Always provide a preview link**:
   ```
   🚀 **Preview your app**: 
   - Local server: http://localhost:8000/preview
   - Direct file: file:///workspace/preview.html
   - Enhanced editor: file:///workspace/agent-preview.html
   ```

3. **Include these features for better UX**:
   - Responsive design (mobile-friendly)
   - Modern CSS with proper typography
   - Error handling for JavaScript
   - Loading states for async operations
   - Accessible HTML structure

4. **Common libraries you can use** (via CDN):
   - **React**: `https://unpkg.com/react@18/umd/react.development.js`
   - **Vue**: `https://unpkg.com/vue@3/dist/vue.global.js`
   - **Alpine.js**: `https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js`
   - **Tailwind CSS**: `https://cdn.tailwindcss.com`
   - **Chart.js**: `https://cdn.jsdelivr.net/npm/chart.js`
   - **Three.js**: `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js`

## Example Response Template

```markdown
I've created your [app description] app! 

**Features:**
- [List key features]
- Responsive design
- [Any special functionality]

**🚀 Try it now:**
- **Live preview**: http://localhost:8000/preview
- **Edit mode**: file:///workspace/agent-preview.html

**Files created:**
- `preview.html` - The main application
- [Any other files]

The app is ready to use immediately - just click the preview link!
```

## Technical Guidelines

### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>App Name</title>
    <!-- Modern CSS framework or custom styles -->
    <style>
        /* Include comprehensive styles */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; }
        /* ... */
    </style>
</head>
<body>
    <div id="app">
        <!-- App content -->
    </div>
    <!-- Scripts at the end -->
    <script>
        // Modern JavaScript with error handling
    </script>
</body>
</html>
```

### CSS Best Practices
- Use CSS Grid/Flexbox for layouts
- Include hover states and transitions
- Mobile-first responsive design
- CSS custom properties (variables)
- Dark mode support when appropriate

### JavaScript Best Practices
- Use modern ES6+ syntax
- Include error boundaries
- Add loading states
- Implement proper event handling
- Use async/await for promises

## Start Preview Server

To start the preview server (if needed):
```bash
python3 preview-server.py 8000
```

Then any agent can create apps that are instantly viewable at `http://localhost:8000/preview`.

## File Organization

For larger apps, organize like this:
```
workspace/
├── preview.html          # Main preview file
├── agent-preview.html    # Enhanced editor
├── html.html            # Original testing tool
├── apps/
│   ├── my-app/
│   │   ├── index.html
│   │   ├── style.css
│   │   └── script.js
│   └── another-app/
└── AGENT_INSTRUCTIONS.md # This file
```

## Quick Commands

**Start preview server:**
```bash
cd /workspace && python3 preview-server.py
```

**Test a file directly:**
```bash
open file:///workspace/preview.html
# or
firefox /workspace/preview.html
```

**Share via GitHub Pages:**
```bash
# If this is a git repo, any agent can create shareable links
git add . && git commit -m "Add new app" && git push
# Then: https://username.github.io/repo-name/preview.html
```