#!/bin/bash
# Dynamic script to commit and push any HTML file with instant preview
# Usage: ./update-preview.sh "filename.html" "App description"
# Usage: ./update-preview.sh "preview.html"  (for default preview)

cd /workspace

FILENAME="${1:-preview.html}"
DESCRIPTION="${2:-Update app: $FILENAME}"
CURRENT_BRANCH=$(git branch --show-current)

# Add and commit the file
git add "$FILENAME"
git commit -m "$DESCRIPTION"

# Push to make it immediately available via raw GitHub
git push origin "HEAD:$CURRENT_BRANCH"

echo "✅ App updated!"
echo "📁 File: $FILENAME"
echo "🌿 Branch: $CURRENT_BRANCH"

if [ "$FILENAME" = "preview.html" ]; then
    echo "🚀 Instant access: https://raw.githubusercontent.com/MikaelMayer/MikaelMayer.github.io/master/preview.html"
else
    echo "🚀 Instant access: https://raw.githubusercontent.com/MikaelMayer/MikaelMayer.github.io/master/preview.html?branch=$CURRENT_BRANCH&path=$FILENAME"
fi