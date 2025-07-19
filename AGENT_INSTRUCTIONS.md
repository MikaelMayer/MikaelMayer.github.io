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
4. **Always provide the magic link**: 
   ```
   🚀 **Try your app**: file:///workspace/preview.html
   📱 **Mobile-friendly** - bookmark this link!
   ```

5. **Include these features for better UX**:
   - **Mobile-first responsive design**
   - Modern CSS with proper typography  
   - Touch-friendly buttons and interactions
   - Error handling for JavaScript
   - Fast loading (inline everything)

6. **Common libraries you can use** (via CDN):
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
**file:///workspace/preview.html**

📱 **Mobile tip**: Bookmark this link for easy access!

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

**The only link you need:**
```
file:///workspace/preview.html
```

**📱 Mobile setup:**
1. Open the link once on your mobile browser
2. Bookmark it for instant access
3. Any agent-created app appears here immediately
4. Just refresh to see updates!

**🌐 Share via GitHub Pages:**
If this is a git repo, shareable link is:
```
https://username.github.io/repo-name/preview.html
```