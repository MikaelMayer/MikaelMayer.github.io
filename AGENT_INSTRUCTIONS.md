# 🤖 Agent Web App Creation Instructions

## 📱 Mobile-First Preview System

**THE RULE: Always write to `preview.html` for instant mobile-friendly preview!**

When creating ANY web application:

1. **Always overwrite `/workspace/preview.html`** with your complete app
2. **User bookmarks this file** on mobile for instant access
3. **Just refresh the page** to see updates - no servers, no complexity!

## Instructions for Agents

**ALWAYS do this when creating web apps:**

1. **Write to `preview.html`** - Never ask where to put it
2. **Make it mobile-responsive** - Most testing happens on mobile
3. **Include everything in ONE file** - HTML, CSS, JS all together
4. **Commit and push**: Run `./update-preview.sh "App description"`
5. **Always provide the MAGIC URL**: 
   ```
   🚀 **Try your app instantly**: 
   https://raw.githubusercontent.com/MikaelMayer/MikaelMayer.github.io/master/preview.html?branch=BRANCH_NAME&path=FILE_NAME.html
   
   🏠 **Local preview**: file:///workspace/FILE_NAME.html
   📱 **Mobile magic**: The URL works instantly on any device!
   ```

6. **Include these features for better UX**:
   - **Mobile-first responsive design**
   - Modern CSS with proper typography  
   - Touch-friendly buttons and interactions
   - Error handling for JavaScript
   - Fast loading (inline everything)

7. **Common libraries you can use** (via CDN):
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
- Mobile-responsive design
- [Any special functionality]

**🚀 Try it instantly:**
https://raw.githubusercontent.com/MikaelMayer/MikaelMayer.github.io/master/preview.html?branch=BRANCH_NAME&path=FILE_NAME.html

**🏠 Local preview:** file:///workspace/FILE_NAME.html
📱 **Mobile magic**: The URL works instantly on any device!

The app is ready to use immediately - just refresh the page!
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

## 📁 Simple File Organization

```
workspace/
├── preview.html          # 🎯 THE magic preview file (agents always write here)
├── agent-preview.html    # 🔧 Enhanced editor (optional)
├── html.html            # 🧪 Original testing tool
└── AGENT_INSTRUCTIONS.md # 📖 This file
```

## 🔗 Quick Access

**🚀 MAGIC DYNAMIC PREVIEW (bookmark this!):**
```
https://raw.githubusercontent.com/MikaelMayer/MikaelMayer.github.io/master/preview.html
```

**🎯 Dynamic URL System:**
- `preview.html?branch=my-branch&path=my-app.html` - Load specific file from specific branch
- `preview.html?path=calculator.html` - Load file from current branch
- `preview.html?branch=feature-game` - Load preview.html from different branch
- `preview.html` - Show welcome screen with instructions

**📱 Mobile setup:**
1. Bookmark the main preview link above
2. Agents provide custom URLs with branch/path parameters
3. Apps load instantly from raw GitHub (no 1-minute delay!)
4. Works on any device with internet

**Local development:**
```
file:///workspace/preview.html
```

**🌐 GitHub Pages (slower, 1-min delay):**
```
https://mikaelmayer.github.io/preview.html
```