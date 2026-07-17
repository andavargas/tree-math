# tree-math — Sympose It, web edition

A vanilla-JavaScript port of **Sympose It**, a 2016 iOS app that visualized
algebraic manipulation as an interactive tree. No build step, no backend,
no dependencies — just open `index.html`.

## What it does

Type an equation (e.g. `y - 1/x = 1`) and it is drawn as a tree rooted at the
equals sign: one side of the equation opens to the left, the other to the
right, with numbers and variables as leaves.

- **Red circle (+)** — an addition node joining any number of terms.
- **Blue circle (×)** — a multiplication node joining any number of factors.
- **Red `\` on a branch** — that piece is subtracted (an additive inverse).
- **Blue `/` on a branch** — that piece is divided by (a multiplicative
  inverse). Both can appear together, as in `y - 1/x = 1`.

### Interactions

- **Click the `=` sign** to select it; every position it can move to
  (anywhere in the tree) is shown as a dashed spot at the midpoint between
  two nodes. Hovering a spot previews exactly what committing the move will
  look like — the Result box updates and a white dashed trail traces the
  route, with red/blue side trails to the inverses that change along the
  way. Clicking the spot commits the move and solves for that constituent
  (`x + y = z` → `x = -y + z`). An arriving equals sign pushes any slashes
  on its edge to the far side; slashes of the same kind that collide cancel.
- **Click a slash** to select it; every place it can slide to is shown the
  same way, with the same hover preview: through matching nodes
  (`-(x+y)` → `-x - y`, `1/(x·y)` → `(1/x)·(1/y)`), onto a single factor
  (`-(x·y)` → `(-x)·y`), or across the `=` sign (`1/x = y - 1` →
  `x = 1/(y - 1)`). The slash travels as a token, passing over anything on
  the edges in between — an intervening slash never blocks it. If a spot
  holds both a subtraction and a division slash, clicking cycles the
  selection: subtraction → division → none. Moves that would break the math
  (sliding `/` through `+`) are not offered, and hovering those positions
  explains why.
- **Flip** mirrors the tree so the two sides of the equation trade places.
- **Recenter** re-draws the tree around the equals sign's current position.
- **Use** feeds the Result back into the input as a new starting equation.

The current equation is mirrored into the URL (`?eq=...`), so a link to the
page reproduces what you typed; opening such a link pre-fills the input bar.

Implicit multiplication is supported (`2x`, `2(b+c)`), and variable names may
be any Unicode characters — letters in any script, symbols, emoji — anything
except digits, whitespace, and the operator characters `+ - * / ( ) =`. Parentheses are respected as
structure: `a+(b+c)` draws a + node nested under another + node, while
`a+b+c` is a single flat + node.

## Running it

It's a static page:

- open `index.html` directly in a browser, or
- serve the folder with any static server, or
- **GitHub Pages**: repo Settings → Pages → "Deploy from a branch" →
  branch `master`, folder `/ (root)`. The app will be published at
  `https://<user>.github.io/tree-math/`.

## Files

| File | Purpose |
|------|---------|
| `tree.js` | Equation model: tokenizer, parser, the unrooted tree with inverse slashes positioned on its edges, the equals-crossing / slash-sliding algebra, and pretty-printing. |
| `view.js` | SVG layout, rendering, and the click-to-select / hover-to-preview interactions. |
| `app.js` | Wires input bar, canvas, output box, and buttons together. |
| `index.html`, `style.css` | Static page shell and styling (light + dark). |

## Credits

Original iOS app: *Sympose It* (2016). A detailed contemporary walkthrough
(in Japanese) survives at
<https://blog.thetheorier.com/entry/sympose-it>.
