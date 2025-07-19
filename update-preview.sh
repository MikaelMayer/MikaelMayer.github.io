#!/bin/bash
# Simple script to commit and push preview.html changes
# Usage: ./update-preview.sh "App description"

cd /workspace

# Add and commit the preview file
git add preview.html
git commit -m "${1:-Update preview app}"

# Push to make it immediately available via raw GitHub
git push origin HEAD:master

echo "✅ Preview updated!"
echo "🚀 Instant access: https://raw.githubusercontent.com/MikaelMayer/MikaelMayer.github.io/master/preview.html"