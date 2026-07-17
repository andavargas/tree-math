/* view.js — SVG rendering + interactions for the equation tree.
 *
 * Everything moves by click, not drag:
 *   - Click the equals sign to select it: every edge it can move to shows a
 *     dashed "=" spot at that edge's midpoint. Hovering a spot previews the
 *     whole move (slashes that would appear are emphasized, ones that would
 *     vanish fade out, the Result box updates); clicking commits it. An
 *     arriving equals sign pushes any slashes on its edge to the far side.
 *   - Click a slash (subtraction \ or division /) to select it: every place
 *     it can be pushed to — through nodes where the math allows, including
 *     hopping across the equals sign — shows a spot, with the same hover
 *     preview. If a spot carries both kinds, clicking cycles the selection:
 *     additive, then multiplicative, then none.
 *
 * Geometry: adjacent nodes are always LEVEL_DX apart; the equals sign sits
 * at the exact midpoint of its edge; slashes sit at the exact midpoint of
 * their edge unless they share it with the equals sign, in which case they
 * sit beside it (per kind, on the side recorded in edge.side). Spacing is
 * chosen so that \/ = \/ fits between two adjacent nodes.
 */
"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const LEVEL_DX = 140;   // horizontal distance between adjacent depths
const SLOT_DY = 62;     // vertical space per leaf
const SIDE_T = 0.72;    // slash position along the equals edge, toward its side
const SPOT_R = 13;      // radius of a destination spot
const HOVER_R = 22;     // hover/click detection distance for spots
const KINDS = ['addInv', 'mulInv'];

function svgEl(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
}

function lerp(p, q, t) {
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
}

function dist(p, q) {
    return Math.hypot(p.x - q.x, p.y - q.y);
}

/* Native hover tooltip: an SVG <title> applies to its whole parent group. */
function addTip(el, text) {
    const t = document.createElementNS(SVG_NS, 'title');
    t.textContent = text;
    el.insertBefore(t, el.firstChild);
}

function midOf(edge) {
    return lerp(edge.a, edge.b, 0.5);
}

function sidePos(edge, sideNode) {
    return lerp(edge.other(sideNode), sideNode, SIDE_T);
}

/* Visual slash clusters: one per occupied position. Ordinary edges show
 * their slashes superimposed at the midpoint; the equals edge has one
 * position on each side of the = sign. */
function slashGroupsOf(graph) {
    const groups = [];
    for (const e of graph.edges) {
        if (e === graph.equalsEdge) {
            for (const posKey of ['aSide', 'bSide']) {
                const kinds = KINDS.filter(k => e.slash[k][posKey]);
                if (!kinds.length) continue;
                const s = e.sideNode(posKey);
                groups.push({ edge: e, kinds, posKey, pos: sidePos(e, s) });
            }
        } else {
            const kinds = KINDS.filter(k => e.slash[k].mid);
            if (kinds.length) groups.push({ edge: e, kinds, posKey: 'mid', pos: midOf(e) });
        }
    }
    return groups;
}

function groupKeyOf(group) {
    return `${group.edge.id}:${group.posKey}`;
}

/* One key per rendered slash, for diffing a preview against the present. */
function slashKeys(graph) {
    const keys = new Map(); // key -> {pos, kind}
    for (const g of slashGroupsOf(graph)) {
        for (const k of g.kinds) {
            keys.set(`${g.edge.id}:${k}:${g.posKey}`, { pos: g.pos, kind: k });
        }
    }
    return keys;
}

class TreeView {
    constructor(svg, { onChange, onNotice, onPreview } = {}) {
        this.svg = svg;
        this.onChange = onChange || (() => {});
        this.onNotice = onNotice || (() => {});
        this.onPreview = onPreview || (() => {});
        this.graph = null;
        this.previewGraph = null;
        this.selection = null; // { type: 'equals' } or { type: 'slash', groupKey, kinds, kindIdx, edge, sideNode }
                               // plus { targets, hovered } for both

        svg.addEventListener('click', (e) => this.handleClick(e));
        svg.addEventListener('pointermove', (e) => this.handleMove(e));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.clearSelection();
        });
    }

    setGraph(graph) {
        this.graph = graph;
        this.selection = null;
        this.previewGraph = null;
        this.layout();
        this.render();
    }

    /* ------------------------------------------------------------ *
     * Layout: the equals edge is the horizontal axis; one endpoint's
     * subtree opens to the left, the other's to the right. Adjacent
     * nodes are LEVEL_DX apart everywhere, including across the
     * equals edge.
     * ------------------------------------------------------------ */
    layout() {
        const g = this.graph;
        if (!g) return;
        const eq = g.equalsEdge;
        const [L, R] = eq.a.x <= eq.b.x ? [eq.a, eq.b] : [eq.b, eq.a];

        const extent = (node, via) => {
            if (node.kind === 'leaf') return 1;
            const kids = node.otherEdges(via);
            if (!kids.length) return 1;
            return kids.reduce((s, e) => s + extent(e.other(node), e), 0);
        };
        const assign = (node, via, depth, dir, top) => {
            node.x = dir * (depth - 0.5) * LEVEL_DX;
            const kids = node.otherEdges(via);
            if (node.kind === 'leaf' || !kids.length) {
                node.y = top + SLOT_DY / 2;
                return;
            }
            let y = top;
            const centers = [];
            for (const e of kids) {
                const c = e.other(node);
                const ext = extent(c, e);
                assign(c, e, depth + 1, dir, y);
                centers.push(c.y);
                y += ext * SLOT_DY;
            }
            node.y = (centers[0] + centers[centers.length - 1]) / 2;
        };

        assign(L, eq, 1, -1, -extent(L, eq) * SLOT_DY / 2);
        assign(R, eq, 1, +1, -extent(R, eq) * SLOT_DY / 2);
        this.fitViewBox();
    }

    /* Mirror the whole tree so the two sides of the equation trade places.
     * Only display geometry changes; each side keeps its own child order. */
    flip() {
        if (!this.graph) return;
        this.clearSelection();
        const eq = this.graph.equalsEdge;
        eq.a.x = -eq.a.x;
        eq.b.x = -eq.b.x;
        this.layout();
        this.render();
    }

    fitViewBox() {
        const PAD = 70;
        let minX = -LEVEL_DX, maxX = LEVEL_DX, minY = -SLOT_DY, maxY = SLOT_DY;
        for (const n of this.graph.nodes) {
            minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
            minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
        }
        this.svg.setAttribute('viewBox',
            `${minX - PAD} ${minY - PAD} ${maxX - minX + 2 * PAD} ${maxY - minY + 2 * PAD}`);
    }

    /* ------------------------------------------------------------ *
     * Rendering
     * ------------------------------------------------------------ */
    render() {
        const shown = this.previewGraph || this.graph;
        this.svg.innerHTML = '';
        if (!shown) return;

        const edgesG = svgEl('g', {}, this.svg);
        const flagsG = svgEl('g', { class: this.previewGraph ? 'previewing' : '' }, this.svg);
        const nodesG = svgEl('g', {}, this.svg);
        const topG = svgEl('g', {}, this.svg);
        this.overlayG = svgEl('g', {}, this.svg);

        for (const e of shown.edges) {
            svgEl('line', { x1: e.a.x, y1: e.a.y, x2: e.b.x, y2: e.b.y, class: 'edge' }, edgesG);
        }

        // Slashes. While previewing a *slash* move, the moving slash is
        // emphasized at its destination and side-effect cancellations show
        // as faded ghosts. An *equals* preview draws the slashes exactly as
        // they will look after the click — no ghosts, no emphasis.
        const slashSel = this.selection && this.selection.type === 'slash' ? this.selection : null;
        const realKeys = this.previewGraph && slashSel ? slashKeys(this.graph) : null;
        const slashLine = (parent, kind, cls) => {
            const [y1, y2] = kind === 'addInv' ? [-8, 8] : [8, -8];
            svgEl('line', { x1: -8, y1, x2: 8, y2, class: cls }, parent);
        };
        for (const group of slashGroupsOf(shown)) {
            const key = groupKeyOf(group);
            const grp = svgEl('g', {
                class: 'slash',
                transform: `translate(${group.pos.x} ${group.pos.y})`,
                'data-group': key,
            }, flagsG);
            const selected = !this.previewGraph && this.selection
                && this.selection.type === 'slash' && this.selection.groupKey === key;
            if (selected) {
                svgEl('circle', {
                    r: 15,
                    class: `slash-selected-ring ${this.selection.kind === 'addInv' ? 'add' : 'mul'}`,
                }, grp);
            }
            for (const k of group.kinds) slashLine(grp, k, 'slash-halo');
            for (const k of group.kinds) {
                const fullKey = `${group.edge.id}:${k}:${group.posKey}`;
                const appearing = realKeys && !realKeys.has(fullKey);
                const isSel = selected && this.selection.kind === k;
                slashLine(grp, k,
                    `slash-stroke ${k === 'addInv' ? 'add' : 'mul'}${appearing ? ' appearing' : ''}${isSel ? ' selected' : ''}`);
            }
            if (!this.previewGraph) {
                svgEl('circle', { r: 16, class: 'hit' }, grp);
                addTip(grp, group.kinds.length === 2
                    ? 'Subtraction \\ and division / — click to select the \\; click again to switch to the /'
                    : group.kinds[0] === 'addInv'
                        ? 'Subtraction slash — click to see everywhere it can move'
                        : 'Division slash — click to see everywhere it can move');
            } else if (slashSel && this.selection.hovered
                       && dist(group.pos, this.selection.hovered.pos) < 2) {
                grp.classList.add('placeable');
                addTip(grp, `Click to place the ${slashSel.kind === 'addInv' ? 'subtraction' : 'division'} slash here`);
            }
        }
        if (this.previewGraph && slashSel) {
            // No ghosts: the preview shows the slashes exactly as they will
            // look after the click. Only the selected slash's origin keeps
            // its colored selection ring until the move actually commits.
            const pos = slashSel.posKey === 'mid'
                ? midOf(slashSel.edge)
                : sidePos(slashSel.edge, slashSel.edge.sideNode(slashSel.posKey));
            svgEl('circle', {
                cx: pos.x, cy: pos.y, r: 15,
                class: `slash-selected-ring ${slashSel.kind === 'addInv' ? 'add' : 'mul'}`,
            }, flagsG);
        }

        for (const n of shown.nodes) {
            const grp = svgEl('g', {
                class: `node ${n.kind}`,
                transform: `translate(${n.x} ${n.y})`,
            }, nodesG);
            const len = [...(n.label || '')].length;
            const r = n.kind === 'leaf' ? Math.min(28, Math.max(20, 8 + len * 6)) : 21;
            svgEl('circle', { r, class: 'node-circle' }, grp);
            svgEl('text', {
                class: 'node-label',
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
                'font-size': n.kind !== 'leaf' ? 24 : (len <= 3 ? 18 : len <= 5 ? 14 : 11),
            }, grp).textContent = n.symbol();
            addTip(grp, n.kind === 'add'
                ? 'Addition: joins the terms of a sum'
                : n.kind === 'mul'
                    ? 'Multiplication: joins the factors of a product'
                    : (/^\d/.test(n.label || '') ? `Number ${n.label}` : `Variable ${n.label}`));
        }

        // Equals glyph, always at the midpoint of its edge. While selected,
        // one extra white circle marks the stationed position — it stays
        // there during hover previews and only leaves when the move commits.
        // The equals shown at a previewed position looks exactly like it
        // will after the click.
        const eqSelected = this.selection && this.selection.type === 'equals';
        if (eqSelected && this.previewGraph) {
            const gp = midOf(this.graph.equalsEdge);
            svgEl('circle', { cx: gp.x, cy: gp.y, r: 23, class: 'equals-select-ring' }, topG);
        }
        const eqP = midOf(shown.equalsEdge);
        const eqG = svgEl('g', {
            class: `equals${eqSelected ? ' selected' : ''}`,
            transform: `translate(${eqP.x} ${eqP.y})`,
        }, topG);
        if (eqSelected && !this.previewGraph) {
            svgEl('circle', { r: 23, class: 'equals-select-ring' }, eqG);
        }
        svgEl('circle', { r: 17, class: 'equals-circle' }, eqG);
        svgEl('text', {
            class: 'equals-label',
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            dy: '-1.5',
        }, eqG).textContent = '=';
        svgEl('circle', { r: 22, class: 'hit' }, eqG);
        addTip(eqG, this.previewGraph && eqSelected
            ? 'Click to place the equals sign here'
            : 'Equals sign — click to see everywhere it can move');

        this.updateOverlay();
    }

    updateOverlay() {
        if (!this.overlayG) return;
        this.overlayG.innerHTML = '';
        if (!this.selection) return;

        for (const t of this.selection.targets) {
            // The hovered site is not marked: the preview already shows
            // exactly what committing the move there will look like. The
            // other sites are bare dashed circles — the moved glyph itself
            // only appears at a site while a hover previews it there.
            if (this.selection.hovered === t) continue;
            const dimmed = !!this.selection.hovered;
            const grp = svgEl('g', {
                class: `spot${dimmed ? ' dimmed' : ''} no-pointer`,
                transform: `translate(${t.pos.x} ${t.pos.y})`,
            }, this.overlayG);
            svgEl('circle', { r: SPOT_R }, grp);
        }

        // Invisible hover regions on the spots a division slash cannot
        // reach: no decoration, no cursor change, just an explanation.
        for (const b of this.selection.blocked || []) {
            const c = svgEl('circle', {
                cx: b.pos.x, cy: b.pos.y, r: SPOT_R, class: 'blocked-spot',
            }, this.overlayG);
            addTip(c, "Can't move here — a division slash can't pass through a + node");
        }

        // Dashed route from the glyph's current spot to the hovered one.
        if (this.selection.hovered) {
            const trailG = svgEl('g', { class: 'no-pointer' }, this.overlayG);
            for (const s of this.trailSegments(this.selection.hovered)) {
                svgEl('line', {
                    x1: s.p1.x, y1: s.p1.y, x2: s.p2.x, y2: s.p2.y,
                    class: `trail-line${s.sideKind ? ` side ${s.sideKind === 'addInv' ? 'add' : 'mul'}` : ''}`,
                }, trailG);
            }
        }
    }

    svgPoint(evt) {
        const pt = new DOMPoint(evt.clientX, evt.clientY);
        return pt.matrixTransform(this.svg.getScreenCTM().inverse());
    }

    /* ------------------------------------------------------------ *
     * Selection + committing moves
     * ------------------------------------------------------------ */
    handleClick(evt) {
        const onEquals = evt.target.closest && evt.target.closest('.equals');
        const slashEl = evt.target.closest && evt.target.closest('.slash[data-group]');

        if (this.selection) {
            const t = this.findSpot(this.svgPoint(evt));
            if (t) { this.applyTarget(t); return; }
            if (onEquals) {
                const wasEquals = this.selection.type === 'equals';
                this.clearSelection();
                if (!wasEquals) this.selectEquals();
                return;
            }
            if (slashEl && this.selection.type === 'slash'
                && slashEl.getAttribute('data-group') === this.selection.groupKey) {
                this.cycleSlashSelection();
                return;
            }
            this.clearSelection();
            if (slashEl) this.selectSlashGroup(slashEl.getAttribute('data-group'), 0);
            return;
        }

        if (onEquals) { this.selectEquals(); return; }
        if (slashEl) this.selectSlashGroup(slashEl.getAttribute('data-group'), 0);
    }

    handleMove(evt) {
        if (!this.selection) return;
        const t = this.findSpot(this.svgPoint(evt));
        if (this.selection.hovered !== t) {
            this.selection.hovered = t;
            this.setPreview(t);
            this.render();
        }
    }

    findSpot(p) {
        let best = null, bestD = HOVER_R;
        for (const t of this.selection.targets) {
            const d = dist(p, t.pos);
            if (d < bestD) { best = t; bestD = d; }
        }
        return best;
    }

    selectEquals() {
        const targets = this.computeEqualsTargets();
        if (!targets.length) {
            this.onNotice('The equals sign has nowhere to move in this equation.');
            return;
        }
        this.selection = { type: 'equals', kind: null, targets, hovered: null };
        this.render();
    }

    selectSlashGroup(groupKey, kindIdx) {
        const group = slashGroupsOf(this.graph).find(g => groupKeyOf(g) === groupKey);
        if (!group) return;
        if (kindIdx >= group.kinds.length) { this.clearSelection(); return; }
        const kind = group.kinds[kindIdx];
        const { targets, blocked } = this.computeSlashTargets(group.edge, group.posKey, kind);
        this.selection = {
            type: 'slash',
            groupKey, kind, kindIdx,
            edge: group.edge,
            posKey: group.posKey,
            targets,
            blocked,
            hovered: null,
        };
        if (!targets.length) {
            this.onNotice(kind === 'mulInv'
                ? 'This division slash has nowhere to go — division cannot be pushed through a + node.'
                : 'This slash has nowhere to go.');
        }
        this.render();
    }

    cycleSlashSelection() {
        const { groupKey, kindIdx } = this.selection;
        this.selection = null;
        this.setPreview(null);
        this.selectSlashGroup(groupKey, kindIdx + 1);
        if (!this.selection) this.render();
    }

    clearSelection() {
        if (!this.selection && !this.previewGraph) return;
        this.selection = null;
        this.setPreview(null);
        this.render();
    }

    setPreview(target) {
        this.previewGraph = target ? target.preview : null;
        this.onPreview(this.previewGraph);
    }

    applyTarget(t) {
        const kind = this.selection.kind;
        this.selection = null;
        this.setPreview(null);
        replayOps(this.graph, t.ops, kind);
        this.onChange();
        this.render();
    }

    /* ------------------------------------------------------------ *
     * Destination enumeration (each target carries a simulated clone
     * for the hover preview)
     * ------------------------------------------------------------ */
    simulate(ops, kind) {
        const { graph: clone, nodeMap, edgeMap } = this.graph.clone();
        replayOps(clone, ops, kind, n => nodeMap.get(n), e => edgeMap.get(e));
        return { clone, edgeMap };
    }

    /* Equals: every other edge, reached by replaying the crossings along the
     * unique path there; the spot sits at that edge's midpoint. */
    computeEqualsTargets() {
        const g = this.graph;
        const targets = [];
        for (const e of g.edges) {
            if (e === g.equalsEdge) continue;
            const steps = edgePath(g, g.equalsEdge, e);
            if (!steps) continue;
            const ops = steps.map(s => ({ type: 'cross', node: s.node, target: s.target }));
            const { clone } = this.simulate(ops, null);
            targets.push({ ops, preview: clone, pos: midOf(e) });
        }
        return targets;
    }

    /* A slash slides along tree paths as a token: across the = sign on its
     * own edge, over anything sitting on intermediate edges (so an
     * intervening same-kind slash never blocks it), and through any node
     * whose type admits it. BFS over (edge, position) states, one slide op
     * per destination. Landing on an occupied position cancels there
     * (shown in the preview). */
    computeSlashTargets(edge, posKey, kind) {
        const g = this.graph;
        const keyOf = (e, p) => `${e.id}:${p}`;
        const posPoint = (e, p) => (p === 'mid' ? midOf(e) : sidePos(e, e.sideNode(p)));
        const seen = new Set([keyOf(edge, posKey)]);
        const targets = [];
        const queue = [{ edge, posKey, crossings: [] }];

        const expand = (destEdge, destPos, crossings) => {
            const k = keyOf(destEdge, destPos);
            if (seen.has(k)) return;
            seen.add(k);
            const ops = [{
                type: 'slide',
                originEdge: edge, originPos: posKey,
                destEdge, destPos, crossings,
            }];
            const { clone } = this.simulate(ops, kind);
            targets.push({ ops, preview: clone, pos: posPoint(destEdge, destPos) });
            queue.push({ edge: destEdge, posKey: destPos, crossings });
        };

        while (queue.length) {
            const cur = queue.shift();
            const isEq = cur.edge === g.equalsEdge;
            if (isEq) {
                // pass across the = sign to the other side of its edge
                expand(cur.edge, cur.posKey === 'aSide' ? 'bSide' : 'aSide', cur.crossings);
            }
            const throughNodes = isEq ? [cur.edge.sideNode(cur.posKey)] : [cur.edge.a, cur.edge.b];
            for (const N of throughNodes) {
                if (!N.isOp || !g.canDistribute(kind, N)) continue;
                for (const f of N.otherEdges(cur.edge)) {
                    expand(f, f === g.equalsEdge ? f.sideKey(N) : 'mid',
                        [...cur.crossings, { node: N, inEdge: cur.edge, outEdge: f }]);
                }
            }
        }

        // Positions the slash cannot reach (division blocked by + nodes).
        const blocked = [];
        for (const e of g.edges) {
            for (const p of (e === g.equalsEdge ? ['aSide', 'bSide'] : ['mid'])) {
                if (!seen.has(keyOf(e, p))) blocked.push({ pos: posPoint(e, p) });
            }
        }
        return { targets, blocked };
    }

    /* White dashed trail shown while hovering a destination: the route the
     * glyph travels from its current spot to the hovered one, skipping over
     * the + / × circles it passes through, with short side trails to the
     * inverses that get created or cancelled along the way. */
    trailSegments(t) {
        const g = this.graph;
        const segs = [];
        const R = 27; // keep clear of the op-node circles
        const add = (a, b, trimStart, trimEnd, sideKind = null) => {
            const d = dist(a, b);
            if (d < 2) return;
            const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
            const p1 = trimStart ? { x: a.x + ux * R, y: a.y + uy * R } : a;
            const p2 = trimEnd ? { x: b.x - ux * R, y: b.y - uy * R } : b;
            if (dist(p1, p2) > 2) segs.push({ p1, p2, sideKind });
        };
        const slashPosOn = (f, N) => (f === g.equalsEdge ? sidePos(f, N) : midOf(f));

        if (this.selection.type === 'equals') {
            let fromEdge = g.equalsEdge;
            let cur = midOf(fromEdge);
            for (const op of t.ops) {
                const N = op.node;
                const nC = { x: N.x, y: N.y };
                const dest = midOf(op.target);
                add(cur, nC, false, true);
                add(nC, dest, true, false);
                const kind = N.kind === 'add' ? 'addInv' : 'mulInv';
                for (const f of N.otherEdges(fromEdge)) {
                    if (f !== op.target) add(nC, slashPosOn(f, N), true, false, kind);
                }
                fromEdge = op.target;
                cur = dest;
            }
            return segs;
        }

        // slash slide: one op whose crossings are the path's node sequence
        const kind = this.selection.kind;
        const op = t.ops[0];
        const posOf = (e, p) => (p === 'mid' ? midOf(e) : sidePos(e, e.sideNode(p)));
        let cur = posOf(op.originEdge, op.originPos);
        let curIsNode = false;
        for (const c of op.crossings) {
            const nC = { x: c.node.x, y: c.node.y };
            add(cur, nC, curIsNode, true);
            if (!(kind === 'addInv' && c.node.kind === 'mul')) {
                for (const f of c.node.edges) {
                    if (f !== c.inEdge && f !== c.outEdge) {
                        add(nC, slashPosOn(f, c.node), true, false, kind);
                    }
                }
            }
            cur = nC;
            curIsNode = true;
        }
        add(cur, posOf(op.destEdge, op.destPos), curIsNode, false);
        return segs;
    }
}
