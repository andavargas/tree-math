/* tree.js — equation model for Sympose It (web port).
 *
 * An equation is stored as a single unrooted tree:
 *   - leaves are numbers / variables,
 *   - internal nodes are n-ary + or × nodes (1+2+3 stays flat, not nested),
 *   - every edge can carry an additive-inverse flag (drawn as a red \ ,
 *     i.e. subtraction) and/or a multiplicative-inverse flag (blue / ,
 *     i.e. division),
 *   - the equals sign occupies one edge; the subtrees on either side of that
 *     edge are the two sides of the equation.
 *
 * Slashes live at *positions* on an edge: ordinary edges have a single
 * position (the midpoint); the equals edge has one position on each side of
 * the = sign, and may hold the same slash kind on BOTH sides at once
 * ( -1/x = -(y - 1) ). Two slashes of the same kind at the same position
 * cancel. The equation is read off literally: each side of the printed
 * equation is wrapped by exactly the slashes sitting on its side of the =
 * sign. This is sound because negation and reciprocal are involutions and
 * commute with each other, so where a slash sits relative to the = sign
 * carries no algebraic content — F(A) = B and A = F(B) are the same
 * relation.
 */
"use strict";

let _uid = 0;
const _nextId = () => ++_uid;

const INV_KINDS = ['addInv', 'mulInv'];

class TNode {
    constructor(kind, label = null) {
        this.id = _nextId();
        this.kind = kind; // 'leaf' | 'add' | 'mul'
        this.label = label;
        this.edges = [];
        this.x = 0;
        this.y = 0;
    }
    get isOp() { return this.kind !== 'leaf'; }
    otherEdges(except) { return this.edges.filter(e => e !== except); }
    symbol() {
        if (this.kind === 'add') return '+';
        if (this.kind === 'mul') return '×';
        return this.label;
    }
}

class TEdge {
    constructor(a, b, addInv = false, mulInv = false) {
        this.id = _nextId();
        this.a = a;
        this.b = b;
        // Slash positions. Ordinary edges hold slashes at 'mid'; the equals
        // edge holds them per side of the = sign ('aSide' next to endpoint a,
        // 'bSide' next to endpoint b) and may hold both at once.
        // addInv = subtraction (red \), mulInv = division (blue /).
        this.slash = {
            addInv: { mid: addInv, aSide: false, bSide: false },
            mulInv: { mid: mulInv, aSide: false, bSide: false },
        };
        a.edges.push(this);
        b.edges.push(this);
    }
    other(node) { return node === this.a ? this.b : this.a; }
    sideKey(node) { return node === this.a ? 'aSide' : 'bSide'; }
    sideNode(key) { return key === 'aSide' ? this.a : this.b; }
    // Net inversion applied across this edge (all positions XOR up); this is
    // what the edge *means* when read as part of an expression.
    get addInv() { const s = this.slash.addInv; return (s.mid !== s.aSide) !== s.bSide; }
    get mulInv() { const s = this.slash.mulInv; return (s.mid !== s.aSide) !== s.bSide; }
    get hasFlags() { return this.addInv || this.mulInv; }
}

class ParseError extends Error {}

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

const OP_CHARS = "+-*/()=";

function tokenize(text) {
    const chars = [...text.replace(/[{[]/g, '(').replace(/[}\]]/g, ')')];
    const tokens = [];
    let i = 0;
    while (i < chars.length) {
        const c = chars[i];
        if (/\s/.test(c)) { i++; continue; }
        if (OP_CHARS.includes(c)) { tokens.push({ t: c }); i++; continue; }
        if (/[0-9.]/.test(c)) {
            let j = i;
            while (j < chars.length && /[0-9.]/.test(chars[j])) j++;
            const v = chars.slice(i, j).join('');
            if (!/^\d+(\.\d+)?$/.test(v)) throw new ParseError(`"${v}" is not a valid number.`);
            tokens.push({ t: 'atom', v });
            i = j;
            continue;
        }
        // Variable name: any run of non-operator, non-digit characters
        // (letters, Japanese, emoji, ...), optionally with trailing digits (x2).
        let j = i;
        while (j < chars.length && !OP_CHARS.includes(chars[j]) && !/[\s0-9.]/.test(chars[j])) j++;
        while (j < chars.length && /[0-9]/.test(chars[j])) j++;
        tokens.push({ t: 'atom', v: chars.slice(i, j).join('') });
        i = j;
    }
    // Implicit multiplication: 2x, 2(b+c), (a+b)(c+d), )x ...
    const out = [];
    for (const tok of tokens) {
        const prev = out[out.length - 1];
        if (prev && (prev.t === 'atom' || prev.t === ')') && (tok.t === 'atom' || tok.t === '(')) {
            out.push({ t: '*' });
        }
        out.push(tok);
    }
    return out;
}

/* ------------------------------------------------------------------ *
 * Parser: tokens -> AST of { node, addInv, mulInv } wrappers
 * ------------------------------------------------------------------ */

function parseSide(tokens, sideName) {
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];

    function parseExpr() {
        const children = [parseTerm()];
        while (peek() && (peek().t === '+' || peek().t === '-')) {
            const op = next().t;
            const term = parseTerm();
            if (op === '-') term.addInv = !term.addInv;
            children.push(term);
        }
        if (children.length === 1) return children[0];
        return { node: { kind: 'add', children }, addInv: false, mulInv: false };
    }

    function parseTerm() {
        const factors = [parseFactor()];
        while (peek() && (peek().t === '*' || peek().t === '/')) {
            const op = next().t;
            const f = parseFactor();
            if (op === '/') f.mulInv = !f.mulInv;
            factors.push(f);
        }
        if (factors.length === 1) return factors[0];
        return { node: { kind: 'mul', children: factors }, addInv: false, mulInv: false };
    }

    function parseFactor() {
        let addInv = false, mulInv = false;
        while (peek() && (peek().t === '-' || peek().t === '/')) {
            if (next().t === '-') addInv = !addInv; else mulInv = !mulInv;
        }
        const t = next();
        if (!t) throw new ParseError(`The ${sideName} side of the equation is incomplete.`);
        let w;
        if (t.t === 'atom') {
            w = { node: { kind: 'leaf', label: t.v }, addInv: false, mulInv: false };
        } else if (t.t === '(') {
            w = parseExpr();
            const close = next();
            if (!close || close.t !== ')') throw new ParseError('Missing a closing parenthesis ).');
        } else {
            throw new ParseError(`Unexpected "${t.t}" in the ${sideName} side.`);
        }
        w.addInv = w.addInv !== addInv;
        w.mulInv = w.mulInv !== mulInv;
        return w;
    }

    const result = parseExpr();
    if (pos < tokens.length) throw new ParseError(`Unexpected "${tokens[pos].t}" in the ${sideName} side.`);
    return result;
}

/* Drop 0/1 identities (so `1/x` becomes a bare x carrying a division
 * slash) and collapse single children. Parentheses are respected: a+(b+c)
 * keeps its inner + node rather than being flattened into a+b+c. */
function simplifyAst(wrapper) {
    const n = wrapper.node;
    if (n.kind === 'leaf') return wrapper;
    n.children = n.children.map(simplifyAst);

    // Identity elision: in a product, 1 and /1 vanish and -1 transfers its
    // sign to the whole product (so -1/x and -/x mean the same thing); in a
    // sum, 0 and -0 vanish (but 1/0 is left for the user to contemplate).
    const identity = n.kind === 'add' ? '0' : '1';
    let extraNeg = false;
    let kept = [];
    for (const c of n.children) {
        const isIdentityLeaf = c.node.kind === 'leaf' && c.node.label === identity;
        if (n.kind === 'mul' && isIdentityLeaf) {
            if (c.addInv) extraNeg = !extraNeg;
            continue;
        }
        if (n.kind === 'add' && isIdentityLeaf && !c.mulInv) continue;
        kept.push(c);
    }
    if (kept.length === 0) {
        kept = [{ node: { kind: 'leaf', label: identity }, addInv: false, mulInv: false }];
    }
    n.children = kept;
    if (extraNeg) wrapper.addInv = !wrapper.addInv;

    if (n.children.length === 1) {
        const c = n.children[0];
        return {
            node: c.node,
            addInv: wrapper.addInv !== c.addInv,
            mulInv: wrapper.mulInv !== c.mulInv,
        };
    }
    return wrapper;
}

function astSize(wrapper) {
    const n = wrapper.node;
    if (n.kind === 'leaf') return 1;
    return 1 + n.children.reduce((s, c) => s + astSize(c), 0);
}

function buildNode(ast, nodes, edges) {
    const tn = new TNode(ast.kind, ast.label ?? null);
    nodes.push(tn);
    if (ast.kind !== 'leaf') {
        for (const cw of ast.children) {
            const child = buildNode(cw.node, nodes, edges);
            edges.push(new TEdge(tn, child, cw.addInv, cw.mulInv));
        }
    }
    return tn;
}

function parseEquation(text) {
    if (!text || !text.trim()) throw new ParseError('Type an equation to begin.');
    const tokens = tokenize(text);
    const eqIdx = tokens.reduce((acc, t, i) => (t.t === '=' ? [...acc, i] : acc), []);
    if (eqIdx.length === 0) throw new ParseError('Add an equals sign = to make an equation.');
    if (eqIdx.length > 1) throw new ParseError('Use exactly one equals sign =.');
    const lt = tokens.slice(0, eqIdx[0]);
    const rt = tokens.slice(eqIdx[0] + 1);
    if (!lt.length) throw new ParseError('The left side of the equation is empty.');
    if (!rt.length) throw new ParseError('The right side of the equation is empty.');
    const lw = simplifyAst(parseSide(lt, 'left'));
    const rw = simplifyAst(parseSide(rt, 'right'));
    if (astSize(lw) + astSize(rw) > 60) throw new ParseError('Please use a smaller equation.');

    const nodes = [], edges = [];
    const L = buildNode(lw.node, nodes, edges);
    const R = buildNode(rw.node, nodes, edges);
    // Top-level inverses ( -x = /y ) sit on the equals edge, each on the
    // side of the = sign it was typed on ( -x = -y keeps both minuses).
    const eq = new TEdge(L, R);
    for (const k of INV_KINDS) {
        eq.slash[k].aSide = lw[k];
        eq.slash[k].bSide = rw[k];
    }
    edges.push(eq);
    return new EquationGraph(nodes, edges, eq);
}

/* ------------------------------------------------------------------ *
 * Equation graph + the move algebra
 * ------------------------------------------------------------------ */

class EquationGraph {
    constructor(nodes, edges, equalsEdge) {
        this.nodes = nodes;
        this.edges = edges;
        this.equalsEdge = equalsEdge;
    }

    /* Move the equals sign from its current edge e0, across shared op-node
     * `node` of type ⊕, onto e1 (another edge of `node`).
     *
     * With the relation  g(C) ⊕ Σ sj(vj) = f0(V0)  (g = e1's slashes,
     * sj = the sibling edges' slashes, f0 = e0's slashes), solving for the
     * g(C) piece as-is gives  g(C) = f0(V0) ⊕ Σ (inv sj)(vj) : e1's and
     * e0's slashes stay exactly where they are and every *sibling* edge of
     * `node` gets its flag toggled. Slashes of the other kind ride along
     * untouched (they are part of the values being moved).
     */
    moveEqualsAcross(node, target) {
        const e0 = this.equalsEdge, e1 = target;
        const kind = node.kind === 'add' ? 'addInv' : 'mulInv';
        for (const f of node.otherEdges(e0)) {
            if (f !== e1) f.slash[kind].mid = !f.slash[kind].mid;
        }
        // The vacated edge's slashes scoot to the middle; a same-kind pair
        // that collides there cancels.
        for (const k of INV_KINDS) {
            const s = e0.slash[k];
            s.mid = (s.mid !== s.aSide) !== s.bSide;
            s.aSide = s.bSide = false;
        }
        // The arriving equals sign travels from `node` toward the far end of
        // e1, pushing the slashes sitting there ahead of it (they end up
        // between the sign and the node opposite the incoming path).
        const farKey = e1.sideKey(e1.other(node));
        for (const k of INV_KINDS) {
            const s = e1.slash[k];
            if (s.mid) {
                s[farKey] = !s[farKey];
                s.mid = false;
            }
        }
        this.equalsEdge = e1;
    }

    /* May slash `kind` travel through op-node `node`? */
    canDistribute(kind, node) {
        if (!node.isOp) return false;
        if (kind === 'mulInv') return node.kind === 'mul'; // /(x+y) != /x + /y
        return true;
    }

    /* Slide a slash from (originEdge, originPos) to (destEdge, destPos)
     * along `crossings` [{node, inEdge, outEdge}], the nodes on the (unique)
     * path between them. The slash travels as a token: it passes over
     * anything sitting on intermediate edges (including the = sign and
     * other slashes), and at each crossed node it toggles every branch
     * hanging off the path:
     *   - \ through +  : -(x+y)  -> -x - y
     *   - / through ×  : /(x·y)  -> /x · /y
     *   - \ through ×  : -(x·y)  -> (-x)·y   (nothing else toggles)
     * Landing on a position that already holds the same kind cancels both.
     * Soundness: pulling a negation out of (through) a + node negates every
     * other branch of that node, which is exactly the toggle set; ditto
     * multiplicatively; and -(x·y) = (-x)·y needs no side effects.
     */
    slideSlash(kind, originEdge, originPos, destEdge, destPos, crossings) {
        originEdge.slash[kind][originPos] = false;
        for (const c of crossings) {
            if (kind === 'addInv' && c.node.kind === 'mul') continue;
            for (const f of c.node.edges) {
                if (f === c.inEdge || f === c.outEdge) continue;
                const p = f === this.equalsEdge ? f.sideKey(c.node) : 'mid';
                f.slash[kind][p] = !f.slash[kind][p];
            }
        }
        destEdge.slash[kind][destPos] = !destEdge.slash[kind][destPos];
    }

    /* Deep copy (same ids, same coordinates) for previewing moves. */
    clone() {
        const nodeMap = new Map(), edgeMap = new Map();
        const nodes = this.nodes.map(n => {
            const c = new TNode(n.kind, n.label);
            c.id = n.id; c.x = n.x; c.y = n.y;
            nodeMap.set(n, c);
            return c;
        });
        const edges = this.edges.map(e => {
            const c = new TEdge(nodeMap.get(e.a), nodeMap.get(e.b));
            c.id = e.id;
            c.slash = {
                addInv: { ...e.slash.addInv },
                mulInv: { ...e.slash.mulInv },
            };
            edgeMap.set(e, c);
            return c;
        });
        return { graph: new EquationGraph(nodes, edges, edgeMap.get(this.equalsEdge)), nodeMap, edgeMap };
    }

    /* ---------------- pretty-printing ---------------- */

    serialize(leftNode = null) {
        const e = this.equalsEdge;
        let L, R;
        if (leftNode) {
            L = leftNode;
            R = e.other(leftNode);
        } else {
            [L, R] = e.a.x <= e.b.x ? [e.a, e.b] : [e.b, e.a];
        }
        let ls = sideString(L, e);
        let rs = sideString(R, e);
        const kindsAt = (node) => INV_KINDS.filter(k => e.slash[k][e.sideKey(node)]);
        ls = wrapKinds(ls, kindsAt(L), L.isOp);
        rs = wrapKinds(rs, kindsAt(R), R.isOp);
        return `${ls} = ${rs}`;
    }
}

/* The (unique) sequence of node-crossings taking the equals sign from edge
 * `from` to edge `to`: [{ node, target }, ...], or null if unreachable
 * (crossings only pass through op nodes). */
function edgePath(graph, from, to) {
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
        const e = queue.shift();
        if (e === to) break;
        for (const N of [e.a, e.b]) {
            if (!N.isOp) continue;
            for (const e2 of N.otherEdges(e)) {
                if (!prev.has(e2)) {
                    prev.set(e2, { edge: e, node: N });
                    queue.push(e2);
                }
            }
        }
    }
    if (!prev.has(to)) return null;
    const steps = [];
    let cur = to;
    while (prev.get(cur)) {
        const p = prev.get(cur);
        steps.unshift({ node: p.node, target: cur });
        cur = p.edge;
    }
    return steps;
}

function wrapKinds(str, kinds, compound) {
    let s = str;
    const hasMul = kinds.includes('mulInv');
    if (hasMul) s = compound ? `1/(${s})` : `1/${s}`;
    if (kinds.includes('addInv')) s = hasMul ? `-${s}` : (compound ? `-(${s})` : `-${s}`);
    return s;
}

/* Replay a recorded op sequence on `graph`. `mapN`/`mapE` translate the
 * node/edge references stored in the ops (used to replay a plan recorded
 * against the real graph onto one of its clones). */
function replayOps(graph, ops, kind, mapN = (x) => x, mapE = (x) => x) {
    for (const op of ops) {
        if (op.type === 'cross') {
            graph.moveEqualsAcross(mapN(op.node), mapE(op.target));
        } else if (op.type === 'slide') {
            graph.slideSlash(kind,
                mapE(op.originEdge), op.originPos,
                mapE(op.destEdge), op.destPos,
                op.crossings.map(c => ({
                    node: mapN(c.node),
                    inEdge: mapE(c.inEdge),
                    outEdge: mapE(c.outEdge),
                })));
        }
    }
}

function sideString(node, via) {
    if (node.kind === 'leaf') return node.label;
    const parts = node.otherEdges(via).map(e => ({ e, child: e.other(node) }));

    if (node.kind === 'add') {
        let s = '';
        parts.forEach(({ e, child }, i) => {
            let sub = sideString(child, e);
            const compound = child.kind !== 'leaf';
            if (e.mulInv) sub = compound ? `1/(${sub})` : `1/${sub}`;
            else if (child.kind === 'add') sub = `(${sub})`;
            if (i === 0) s = e.addInv ? `-${sub}` : sub;
            else s += e.addInv ? ` - ${sub}` : ` + ${sub}`;
        });
        return s;
    }

    // mul node: factors printed literally in order, one per branch, so the
    // string mirrors the diagram ( 1/x*1/y stays 1/x*1/y, not 1/(x*y) ).
    // Nested op nodes keep their parentheses so structure round-trips.
    const pieces = parts.map(({ e, child }) => {
        let sub = sideString(child, e);
        if (child.kind !== 'leaf') sub = `(${sub})`;
        if (e.mulInv) sub = `1/${sub}`;
        if (e.addInv) sub = `(-${sub})`;
        return sub;
    });
    return pieces.join('*');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TNode, TEdge, ParseError, parseEquation, EquationGraph, sideString, edgePath, replayOps };
}
