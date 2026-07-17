/* app.js — wires the input bar, tree view, and output box together. */
"use strict";

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('input-equation');
    const output = document.getElementById('output-equation');
    const message = document.getElementById('message');
    const useBtn = document.getElementById('use-btn');
    const flipBtn = document.getElementById('flip-btn');
    const recenterBtn = document.getElementById('recenter-btn');
    const examplesBox = document.getElementById('examples');
    const svg = document.getElementById('canvas');

    let graph = null;
    let noticeTimer = null;

    const view = new TreeView(svg, {
        onChange: updateOutput,
        onNotice: (msg) => showMessage(msg, 'warn'),
        onPreview: (previewGraph) => {
            const g = previewGraph || graph;
            output.value = g ? g.serialize() : '';
            output.classList.toggle('previewing', !!previewGraph);
        },
    });

    function showMessage(text, cls) {
        clearTimeout(noticeTimer);
        message.textContent = text;
        message.className = `message ${cls}`;
        message.hidden = false;
        if (cls === 'warn') {
            noticeTimer = setTimeout(() => { message.hidden = true; }, 3500);
        }
    }

    function hideMessage() {
        clearTimeout(noticeTimer);
        message.hidden = true;
    }

    function updateOutput() {
        output.value = graph ? graph.serialize() : '';
    }

    function syncUrl() {
        try {
            const url = new URL(window.location);
            url.searchParams.set('eq', input.value);
            history.replaceState(null, '', url);
        } catch (_) { /* e.g. file:// in some browsers — the app works without it */ }
    }

    function rebuild() {
        try {
            graph = parseEquation(input.value);
        } catch (err) {
            if (err instanceof ParseError) {
                showMessage(err.message, 'hint');
                return;
            }
            throw err;
        }
        hideMessage();
        view.setGraph(graph);
        updateOutput();
        syncUrl();
    }

    input.addEventListener('input', rebuild);

    flipBtn.addEventListener('click', () => {
        if (!graph) return;
        view.flip();
        updateOutput();
    });

    recenterBtn.addEventListener('click', () => {
        if (!graph) return;
        view.clearSelection();
        view.layout();
        view.render();
        updateOutput();
    });

    useBtn.addEventListener('click', () => {
        if (!graph) return;
        input.value = graph.serialize();
        rebuild();
    });

    const examples = [
        { eq: 'x + y = z', tip: 'A simple sum — click the = sign and move it next to x to solve for x.' },
        { eq: 'y - 1/x = 1', tip: 'Subtraction and division stacked on one branch: the x carries both slashes.' },
        { eq: 'a*b = c + d', tip: 'A product on one side, a sum on the other — the = can cross both kinds of node.' },
        { eq: '-(x + y) = z', tip: 'A negated group — click the minus and push it through the + node to distribute it.' },
        { eq: '2(b + c) = d*e', tip: 'Implicit multiplication: 2(b+c) means 2*(b+c).' },
    ];
    for (const { eq, tip } of examples) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'example-chip';
        btn.textContent = eq;
        btn.title = tip;
        btn.addEventListener('click', () => {
            input.value = eq;
            rebuild();
        });
        examplesBox.appendChild(btn);
    }

    const urlEq = new URLSearchParams(window.location.search).get('eq');
    input.value = urlEq || examples[0].eq;
    rebuild();
});
