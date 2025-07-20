#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Mock DOM globals for Node.js
global.window = {
    addEventListener: () => {},
    location: { search: '' }
};

global.document = {
    getElementById: (id) => ({
        textContent: '',
        innerHTML: '',
        style: {},
        classList: {
            add: () => {},
            remove: () => {},
            contains: () => false
        },
        appendChild: () => {},
        addEventListener: () => {}
    }),
    createElement: (tag) => ({
        className: '',
        textContent: '',
        innerHTML: '',
        style: {},
        classList: {
            add: () => {},
            remove: () => {},
            contains: () => false
        },
        appendChild: () => {},
        addEventListener: () => {}
    }),
    addEventListener: () => {},
    body: {
        focus: () => {}
    },
    querySelectorAll: () => []
};

function extractJavaScript(htmlContent) {
    const scriptMatch = htmlContent.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    return scriptMatch ? scriptMatch[1] : '';
}

function runTest(htmlFile, testCode) {
    try {
        // Read the HTML file
        const htmlContent = fs.readFileSync(htmlFile, 'utf8');
        
        // Extract JavaScript from the HTML
        const jsCode = extractJavaScript(htmlContent);
        
        if (!jsCode.trim()) {
            console.log('❌ No JavaScript found in HTML file');
            return;
        }
        
        console.log('🧪 Testing JavaScript extracted from:', htmlFile);
        console.log('📝 Running test code...\n');
        
        // Execute the extracted JavaScript and make variables global
        // Replace let/const with var to make variables accessible
        const modifiedJsCode = jsCode
            .replace(/\blet\s+/g, 'var ')
            .replace(/\bconst\s+/g, 'var ');
        
        eval(modifiedJsCode);
        
        // Execute the test code
        eval(testCode);
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.log('❌ Test failed with error:');
        console.log(error.message);
        console.log('\nStack trace:');
        console.log(error.stack);
    }
}

// Command line interface
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: node test/test.js <html-file> "<test-javascript>"');
    console.log('');
    console.log('Example:');
    console.log('  node test/test.js demo-calculator.html "console.log(\'Testing:\', stack)"');
    process.exit(1);
}

const htmlFile = args[0];
const testCode = args[1];

if (!fs.existsSync(htmlFile)) {
    console.log(`❌ HTML file not found: ${htmlFile}`);
    process.exit(1);
}

runTest(htmlFile, testCode);