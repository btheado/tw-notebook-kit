/*\
title: $:/plugins/btheado/notebook-kit/widget.js
type: application/javascript
module-type: widget

<$notebook-kit>
  <$navigator story="$:/temp/DemoStoryList" history="$:/temp/DemoHistoryList">
    <$list
      filter="[list[$:/temp/DemoStoryList]]"
      history="$:/temp/DemoHistoryList"
      template="my cell view template"
      editTemplate={{$:/config/ui/EditTemplate}}
      storyview="classic"
      emptyMessage="No notebook cells"/>
  </$navigator>
</$notebook-kit>

This widget does NOT enumerate or display cells itself. It renders
whatever it's given as content (typically a $list/$navigator combo
that already knows how to list, order, and edit tiddlers) and then
searches the resulting DOM for elements that mark themselves as a
cell's output target.

Convention, entirely owned by the cell view template (not by this
widget):
  - Somewhere in a cell's rendered markup, include an element matching
    `outputSelector` (default: ".tc-notebook-output").
  - That element must carry an attribute (default: "data-tiddler-title",
    configurable via `titleAttribute`) whose value is the tiddler title
    driving that cell.

Example cell view template tiddler:

    <div class="tc-notebook-output" data-notebook-cell=<<currentTiddler>>></div>

    <$transclude tiddler=<<currentTiddler>> mode="block"/>

Attributes:
  outputSelector - CSS selector identifying a cell's output element
                   (default: ".tc-notebook-output")
  titleAttribute - attribute on that element holding the cell's tiddler
                   title (default: "data-tiddler-title")

\*/
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

/* ---------------------------------------------------------------------
   Observable Notebook Kit is loaded once, lazily, via dynamic import
   (top-level `import` isn't available inside a TiddlyWiki module, but
   the `import()` operator works fine at runtime in the browser).
------------------------------------------------------------------- */

var notebookKitPromise = null;
const style_urls = [
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/inspector.css',
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/highlight.css',
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/plot.css',
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/index.css',
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/theme-slate.css',
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/abstract-dark.css',
    'https://raw.githubusercontent.com/observablehq/notebook-kit/6c2ec69e1ac30dd329789524a849578b2df17945/src/styles/syntax-dark.css'
];

// Maps each URL to a fetch Promise, resolves the text, 
// and joins them together once all fetches succeed.
const fetch_style_sheets = (urls) => {
    return Promise.all(
        urls.map(url => fetch(url).then(res => res.text()))
    ).then(texts => texts.join("\n"));
};

function add_notebook_kit_styles() {
    const view = document.defaultView;
    const sheet = new view.CSSStyleSheet();
    
    // Fetch the styles and add them to the document
    return fetch_style_sheets(style_urls).then(stylesText => {
        sheet.replaceSync(stylesText);
        document.adoptedStyleSheets.push(sheet);
    });
}

function loadNotebookKit() {
	if(!notebookKitPromise) {
		notebookKitPromise = Promise.all([
			import("https://cdn.jsdelivr.net/npm/@observablehq/notebook-kit@2.1.6/runtime/+esm"),
			import("https://cdn.jsdelivr.net/npm/@observablehq/notebook-kit@2.1.6/+esm")
		]).then(function(modules) {
			return {
				NotebookRuntime: modules[0].NotebookRuntime,
				transpile: modules[1].transpile
			};
		});
		add_notebook_kit_styles();
	}
	return notebookKitPromise;
}

/* ---------------------------------------------------------------------
   Map a tiddler's `type` field to a Notebook Kit language mode.
------------------------------------------------------------------- */

var MODE_BY_TYPE = {
	"application/javascript": "js",
	"text/javascript": "js",
	"application/vnd.observable.javascript": "ojs",
	"text/x-typescript": "ts",
	"text/markdown": "md",
	"text/x-markdown": "md",
	"text/html": "html",
	"application/sql": "sql",
	"text/x-tex": "tex",
	"application/x-tex": "tex",
	"text/vnd.graphviz": "dot"
};

function modeForTiddler(tiddler) {
	var type = (tiddler && tiddler.fields.type) || "";
	return MODE_BY_TYPE[type] || "js";
}

const noobserver = {};
function dispose(variable) {
	if(variable._disposed) return;
	variable._disposed = true;
	variable._observer &&= noobserver; // don't render undefined
	variable.delete();
}

function clearCellVariables(cell) {
	(cell.variables || []).forEach(dispose);
	cell.variables = [];
}

/* ---------------------------------------------------------------------
   Widget
------------------------------------------------------------------- */

exports["notebook-kit"] = NotebookWidget;

function NotebookWidget(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
}

NotebookWidget.prototype = Object.create(Widget.prototype);

NotebookWidget.prototype.render = function(parent, nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();

	// A single wrapper for the whole notebook - not per cell - purely so
	// we have a stable DOM scope to search for output elements in. Actual
	// display/listing/editing is entirely the responsibility of whatever
	// widgets are nested inside <$notebook>...</$notebook>.
	this.notebookRoot = this.document.createElement("div");
	this.notebookRoot.className = "tc-notebook-widget";
	parent.insertBefore(this.notebookRoot, nextSibling);
	this.domNodes.push(this.notebookRoot);

	this.cells = new Map(); // output DOM element -> cell record
	this.cellsByTitle = new Map(); // tiddler title -> the currently "live" cell for that title
	this.runtime = null;
	this.kit = null;
	this.removed = false;
debugger;
	this.renderChildren(this.notebookRoot, null);
	this.reconcileCells();

	var self = this;
	loadNotebookKit().then(function(kit) {
		if(self.removed) return;
		self.kit = kit;
		self.runtime = new kit.NotebookRuntime();
		self.cells.forEach(function(cell) {
			self.evaluateCell(cell);
		});
	}).catch(function(error) {
    // TODO: display something in the DOM
		console.error("tc-notebook: failed to load Observable Notebook Kit", error);
	});
};

NotebookWidget.prototype.execute = function() {
	this.outputSelector = this.getAttribute("outputSelector", ".tc-notebook-output");
	this.titleAttribute = this.getAttribute("titleAttribute", "data-tiddler-title");
	this.makeChildWidgets();
};

/* Find every element within our DOM scope that currently marks itself
   as a cell's output target. */
NotebookWidget.prototype.findOutputElements = function() {
	var selector = this.outputSelector;
	var root = this.notebookRoot;
	var results = Array.prototype.slice.call(root.querySelectorAll(selector));
	if(root.matches && root.matches(selector)) {
		results.unshift(root);
	}
	return results;
};

/* Reconcile our tracked cells against whatever output elements currently
   exist in the DOM. Cells are keyed by DOM element identity, so they
   naturally come and go as the nested $list/$navigator adds, removes,
   or swaps to an edit template - no filter or title list to maintain
   here at all. Returns true if anything changed. */
NotebookWidget.prototype.reconcileCells = function() {
	var self = this;
	var currentElements = this.findOutputElements();
	var currentSet = new Set(currentElements);
	var changed = false;

	this.cells.forEach(function(cell, element) {
		if(!currentSet.has(element)) {
			self.disposeCell(cell);
			self.cells.delete(element);
			if(self.cellsByTitle.get(cell.title) === cell) {
				self.cellsByTitle.delete(cell.title);
			}
			changed = true;
		}
	});

	currentElements.forEach(function(element) {
		if(!self.cells.has(element)) {
			var cell = self.createCell(element);
			self.cells.set(element, cell);
			changed = true;
		}
	});

	return changed;
};

NotebookWidget.prototype.createCell = function(element) {
	var title = element.getAttribute(this.titleAttribute);
	if(!title) {
		console.warn("tc-notebook: output element is missing its '" + this.titleAttribute + "' attribute", element);
	}

	// If another (older) element is still live for this same title - almost
	// certainly a transition/animation overlap - supersede it now. Dispose
	// its runtime variables synchronously so the new definition doesn't
	// collide, but leave its DOM bookkeeping alone; the removal loop above
	// will clean up `this.cells` for it once its element actually leaves
	// the DOM (disposeCell is idempotent, see below).
	var stale = this.cellsByTitle.get(title);
	if(stale && stale.root !== element) {
		this.disposeCell(stale);
		stale.superseded = true;
	}

	var cell = {
		title: title,
		root: element,
		variables: [],
		lastType: null,
		lastText: null,
		superseded: false
	};

	if(this.runtime && this.kit) {
		this.evaluateCell(cell);
	}

	this.cellsByTitle.set(title, cell);

	return cell;
};

NotebookWidget.prototype.evaluateCell = function(cell) {
	var tiddler = this.wiki.getTiddler(cell.title);
	var text = (tiddler && tiddler.fields.text) || "";
	var mode = modeForTiddler(tiddler);

	cell.lastType = tiddler && tiddler.fields.type;
	cell.lastText = text;

	if(!this.runtime || !this.kit) {
		return; // runtime still loading; will be evaluated once ready
	}

	clearCellVariables(cell);

	try {
		var transpiled = this.kit.transpile(text, mode);
		var definition = Object.assign({}, transpiled, {
			id: cell.title,
			body: eval.call(null, transpiled.body)
		});
		cell.root.textContent = "";
		// `cell` acts as notebook-kit's "node": it has `.root` (read live off
		// this object, so later runtime updates keep targeting whatever
		// `cell.root` currently points to) and `.variables`.
		this.runtime.define(cell, definition);
	} catch(error) {
		console.error("tc-notebook: error evaluating cell '" + cell.title + "'", error);
		cell.root.textContent = "Error: " + error.message;
	}
};

NotebookWidget.prototype.disposeCell = function(cell) {
	// The DOM element itself belongs to whatever nested widget rendered it
	// (the $list, typically) - it's responsible for adding/removing it.
	// We just stop tracking it and tear down its notebook-kit variables.
	clearCellVariables(cell);
};

/* For cells whose output element persisted across this refresh, check
   whether their underlying tiddler actually changed and re-evaluate if so. */
NotebookWidget.prototype.reevaluateChangedCells = function(changedTiddlers) {
	var self = this;
	var any = false;
	this.cells.forEach(function(cell) {
		if(cell.superseded) return;
		if(changedTiddlers[cell.title]) {
			var tiddler = self.wiki.getTiddler(cell.title);
			var textChanged = !tiddler || tiddler.fields.text !== cell.lastText;
			var typeChanged = !tiddler || tiddler.fields.type !== cell.lastType;
			if(textChanged || typeChanged) {
				self.evaluateCell(cell);
				any = true;
			}
		}
	});
	return any;
};

NotebookWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(changedAttributes.outputSelector || changedAttributes.titleAttribute) {
		this.refreshSelf();
		return true;
	}

	var childrenRefreshed = this.refreshChildren(changedTiddlers);
	var cellsChanged = this.reconcileCells();
	var reevaluated = this.reevaluateChangedCells(changedTiddlers);

	return !!(childrenRefreshed || cellsChanged || reevaluated);
};

NotebookWidget.prototype.destroy = function() {
	var self = this;
	this.removed = true;
	if(this.cells) {
		this.cells.forEach(function(cell) { self.disposeCell(cell); });
		this.cells.clear();
	}
	if(this.runtime && this.runtime.dispose) {
		this.runtime.dispose();
	}
	if(Widget.prototype.destroy) {
		Widget.prototype.destroy.call(this);
	}
};
