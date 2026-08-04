/*\
title: $:/plugins/btheado/notebook-kit/notebook-kit.js
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

function loadNotebookKit() {
	if(!notebookKitPromise) {
		notebookKitPromise = Promise.all([
			import("https://cdn.jsdelivr.net/npm/@observablehq/notebook-kit@2.1.9/runtime/+esm"),
			import("https://cdn.jsdelivr.net/npm/@observablehq/notebook-kit@2.1.9/+esm")
		]).then(function(modules) {
			return {
				NotebookRuntime: modules[0].NotebookRuntime,
				transpile: modules[1].transpile
			};
		});
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

	this.cells = new Map(); // title -> cell record, persistent for widget lifetime
	this.runtime = null;
	this.kit = null;
	this.removed = false;

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
		console.error("tc-notebook: failed to load Observable Notebook Kit", error);
		self.cells.forEach(function(cell) {
			self.showCellError(cell, "Could not load Observable Notebook Kit: " + error.message);
		});
	});
};

NotebookWidget.prototype.execute = function() {
	this.outputSelector = this.getAttribute("outputSelector", ".tc-notebook-output");
	this.titleAttribute = this.getAttribute("titleAttribute", "data-tiddler-title");
	this.makeChildWidgets();
};


NotebookWidget.prototype.findHostElements = function() {
	// hosts mark WHERE a cell's output should live; they are not the output itself
	var selector = this.outputSelector;
	var root = this.notebookRoot;
	var results = Array.prototype.slice.call(root.querySelectorAll(selector));
	if(root.matches && root.matches(selector)) results.unshift(root);
	return results;
};

NotebookWidget.prototype.reconcileCells = function() {
	if (this.notebookRoot.isTiddlyWikiFakeDom) return;
	var self = this;
	var hosts = this.findHostElements();
	var titlesPresent = new Set();

	hosts.forEach(function(host) {
		var title = host.getAttribute(self.titleAttribute);
		if(!title) {
			console.warn("tc-notebook: host element is missing its '" + self.titleAttribute + "' attribute", host);
			return;
		}
		titlesPresent.add(title);
		var cell = self.cells.get(title);
		if(!cell) {
			cell = self.createCell(title);
			self.cells.set(title, cell);
		}
		self.attachOutput(cell, host);
	});

	var changed = false;
	this.cells.forEach(function(cell, title) {
		if(!titlesPresent.has(title)) {
			self.disposeCell(cell);
			self.cells.delete(title);
			changed = true;
		}
	});

	return changed;
};

NotebookWidget.prototype.attachOutput = function(cell, host) {
	if(host.firstElementChild === cell.root) return;
	host.insertBefore(cell.root, host.firstChild);
};

NotebookWidget.prototype.createCell = function(title) {
	var cell = {
		title: title,
		root: this.document.createElement("div"),
		variables: [],
		lastType: null,
		lastText: null
	};
	cell.root.className = "tc-notebook-output-content tc-notebook-output-loading";
	cell.root.textContent = "Loading notebook runtime…";

	if(this.runtime && this.kit) this.evaluateCell(cell);

	return cell;
};

NotebookWidget.prototype.showCellError = function(cell, message) {
	cell.root.className = "tc-notebook-output-content observablehq--error";
	cell.root.textContent = "SyntaxError: " + message;
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
		cell.root.className = "tc-notebook-output-content";
		cell.root.textContent = "";
		// `cell` acts as notebook-kit's "node": it has `.root` (read live off
		// this object, so later runtime updates keep targeting whatever
		// `cell.root` currently points to) and `.variables`.
		this.runtime.define(cell, definition);
	} catch(error) {
		console.error("tc-notebook: error evaluating cell '" + cell.title + "'", error);
		this.showCellError(cell, error.message);
	}
};

NotebookWidget.prototype.disposeCell = function(cell) {
	// The DOM element itself belongs to whatever nested widget rendered it
	// (the $list, typically) - it's responsible for adding/removing it.
	// We just stop tracking it and tear down its notebook-kit variables.
	clearCellVariables(cell);
	cell.root.remove();
};

/* For cells whose output element persisted across this refresh, check
   whether their underlying tiddler actually changed and re-evaluate if so. */
NotebookWidget.prototype.reevaluateChangedCells = function(changedTiddlers) {
	var self = this;
	var any = false;
	Object.keys(changedTiddlers).forEach(function(title) {
		var cell = self.cells.get(title);
		if(!cell) return;
		var tiddler = self.wiki.getTiddler(title);
		var textChanged = !tiddler || tiddler.fields.text !== cell.lastText;
		var typeChanged = !tiddler || tiddler.fields.type !== cell.lastType;
		if(textChanged || typeChanged) {
			self.evaluateCell(cell);
			any = true;
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
