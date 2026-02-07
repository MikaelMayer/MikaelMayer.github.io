# 🤖 Agent App Development System

## Quick Start for Agents

When asked to create any web application, follow these steps:

### 1. **Create Your App**
- Write your complete HTML/CSS/JavaScript app in **ONE file**
- Name it descriptively (e.g., `snake-game.html`, `todo-app.html`, `calculator.html`)
- Make it **mobile-responsive** and modern
- Include everything inline (CSS in `<style>`, JS in `<script>`)

### 2. **Deploy Your App**
```bash
./update-preview.sh your-app-name.html "Brief description of the app"
```

### 3. **Provide the Magic URL**
The script will output an instant preview URL like:
```
🚀 Instant access: https://mikaelmayer.github.io/preview.html?branch=BRANCH_NAME&path=your-app-name.html
```

## 📱 URL System Explained

The preview system uses dynamic URLs that load any HTML file from any branch:

- **Format**: `preview.html?branch=BRANCH&path=FILE.html`
- **Examples**:
  - `preview.html?branch=main&path=calculator.html`
  - `preview.html?branch=feature-game&path=snake.html` 
  - `preview.html?path=todo-app.html` (uses current branch)

**How it works:**
- `preview.html` is served from GitHub Pages (proper HTML rendering)
- App content is fetched from raw GitHub (instant updates)
- Best of both worlds: proper rendering + instant content updates!

**Control buttons in preview:**
- 📱 **Toggle Frame**: Switch between full-screen and windowed view
- 🚀 **Open Direct**: Open raw GitHub file in new tab
- 🌐 **Copy Deploy URL**: Copy permanent GitHub Pages URL to clipboard
- ℹ️ **Info**: Show app details and control explanations

## 🎯 Response Template

Always respond with this format:

```markdown
I've created your [APP_NAME]! 

**Features:**
- [List key features]
- Mobile-responsive design
- [Any special functionality]

**🚀 Try it instantly:**
https://mikaelmayer.github.io/preview.html?branch=CURRENT_BRANCH&path=FILENAME.html

📱 **Mobile magic**: The URL works instantly on any device!
⚠️ **Note**: Never suggest local file:// URLs as users are on mobile and agent is on remote VM

The app is ready to use immediately - just click the link!
```

## 📋 Technical Requirements

### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your App Name</title>
    <style>
        /* All CSS here - mobile-first design */
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, sans-serif; }
        /* Make it beautiful and responsive */
    </style>
</head>
<body>
    <div id="app">
        <!-- Your app content -->
    </div>
    <script>
        // All JavaScript here - modern ES6+
        // Include error handling
    </script>
</body>
</html>
```

### Design Guidelines
- **Mobile-first**: Design for phones, enhance for desktop
- **Touch-friendly**: Large buttons (min 44px), good spacing
- **Modern CSS**: Use Flexbox/Grid, CSS variables, transitions
- **Accessible**: Proper contrast, focus states, semantic HTML
- **Fast loading**: Everything inline, optimized images

### JavaScript Best Practices
- Use modern ES6+ syntax (`const`, `let`, arrow functions, async/await`)
- Add error handling with try/catch
- Include loading states for async operations
- Make it keyboard accessible
- Test on mobile viewport

## 🎨 Common Libraries (via CDN)

You can include these popular libraries:

```html
<!-- React -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

<!-- Vue.js -->
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>

<!-- Alpine.js -->
<script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>

<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<!-- Three.js -->
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
```

## 🎮 Example Apps to Create

When asked to create:

- **Games**: Snake, Tetris, Tic-tac-toe, Memory game, Puzzle games
- **Utilities**: Calculator, Todo list, Timer, Weather app, Unit converter
- **Creative**: Drawing app, Color picker, Image editor, Music player
- **Data**: Chart viewer, JSON formatter, QR generator, Password generator
- **Fun**: Random quote, Joke generator, Magic 8-ball, Dice roller

## 🔧 Advanced Features

### Error Handling
```javascript
try {
    // Your code here
} catch (error) {
    console.error('Error:', error);
    // Show user-friendly message
}
```

### Local Storage
```javascript
// Save data
localStorage.setItem('myApp_data', JSON.stringify(data));

// Load data
const saved = localStorage.getItem('myApp_data');
const data = saved ? JSON.parse(saved) : defaultData;
```

### Responsive Design
```css
/* Mobile first */
.container { padding: 10px; }

/* Tablet */
@media (min-width: 768px) {
    .container { padding: 20px; }
}

/* Desktop */
@media (min-width: 1024px) {
    .container { padding: 40px; max-width: 1200px; margin: 0 auto; }
}
```

## 🚀 Deployment Workflow

1. **Create** your HTML file with everything inline
2. **Deploy**: `./update-preview.sh your-app.html "Description"`
3. **Share** the generated URL with the user
4. **Note**: Never suggest local testing as users are on mobile/remote setup

## 📱 User Experience

The user experience is:
1. User asks for an app
2. Agent creates it and provides instant URL
3. User bookmarks: `https://mikaelmayer.github.io/preview.html`
4. Any future app URLs work with that same bookmark
5. Apps load instantly via raw GitHub (no delays!)

## 🎯 File Organization

```
workspace/
├── README.md                 # This file (agent instructions)
├── preview.html             # Dynamic preview system
├── agent-preview.html       # Enhanced editor (optional)
├── html.html               # Original testing tool
├── update-preview.sh       # Deployment script
├── AGENT_INSTRUCTIONS.md   # Detailed technical docs
├── your-app-name.html      # Your created apps
├── another-app.html        # More apps
└── demo-calculator.html    # Example app
```

## ⚡ Quick Commands

```bash
# Deploy any app
./update-preview.sh filename.html "App description"

# Get current branch (for URL generation)
git branch --show-current

# Check file exists
ls -la your-app.html
```

## 🎉 Success Checklist

Before providing the URL, ensure:
- ✅ App works on mobile viewport
- ✅ All CSS/JS is inline
- ✅ No external dependencies (except CDN libraries)
- ✅ Error handling included
- ✅ Touch-friendly interface
- ✅ Fast loading
- ✅ Beautiful modern design

## 📞 Example Interaction

**User**: "Read readme and create a snake game"

**Agent Response**:
```
I've created a Snake Game for you!

**Features:**
- Classic snake gameplay with arrow key controls
- Touch controls for mobile devices
- Score tracking and high score storage
- Responsive design that works on all devices
- Smooth animations and modern glassmorphism design

**🚀 Try it instantly:**
https://mikaelmayer.github.io/preview.html?branch=cursor/streamline-agent-html-preview-fe49&path=snake-game.html

📱 **Mobile magic**: The URL works instantly on any device!

The game is ready to play immediately - just click the link!
```

---

**Remember**: The goal is instant mobile-friendly access to beautiful, functional web apps. Every app should be a delightful experience that works perfectly on phones! 🚀📱