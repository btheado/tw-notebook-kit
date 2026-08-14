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
				FileAttachment: modules[0].FileAttachment,
				registerFile: modules[0].registerFile,
				library: modules[0].library,
				transpile: modules[1].transpile
			};
		});
	}
	return notebookKitPromise;
}

/* ---------------------------------------------------------------------
   Mappings from a tiddler's `type` field to a Notebook Kit language mode
   are stored in tiddlers with this prefix.
------------------------------------------------------------------- */

var TYPE_MAPPING_PREFIX = "$:/config/NotebookKitPlugin/TypeMappings/";

function modeForTiddler(wiki, tiddler) {
	var type = (tiddler && tiddler.fields.type) || "";
	return wiki.getTiddlerText(TYPE_MAPPING_PREFIX + type);
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

/* FileAttachment expects a synchronous name-to-URL resolver. Tiddlers have
   no URL, so expose their contents as Blob URLs and retain them until the
   tiddler changes or this widget is destroyed. */
function attachmentBlob(tiddler) {
	var fields = tiddler.fields;
	var text = fields.text || "";
	var type = fields.type || "application/octet-stream";
	if(fields.encoding === "base64") {
		var binary = atob(text);
		var bytes = new Uint8Array(binary.length);
		for(var i = 0; i < binary.length; ++i) bytes[i] = binary.charCodeAt(i);
		return new Blob([bytes], {type: type});
	}
	return new Blob([text], {type: type});
}

/* A top-level widget owns one Observable runtime. Descendant widgets use a
   separate Observable module from that runtime, which keeps their notebook
   names isolated while retaining one shared set of built-ins and attachments. */
function findParentNotebook(widget) {
	for(var parent = widget.parentWidget; parent; parent = parent.parentWidget) {
		if(parent.runtimeContext) return parent;
	}
	return null;
}

function scopedRuntime(notebookRuntime, module) {
	/* Notebook Kit 2.1.9's instance methods use `this.main` to select the
	   Observable module. Inherit the remaining NotebookRuntime API, but point
	   define calls at this nested widget's module. */
	var facade = Object.create(notebookRuntime);
	facade.runtime = notebookRuntime.runtime;
	facade.main = module;
	return facade;
}

function resolveTiddlerAttachment(context, title) {
	var tiddler = context.wiki.getTiddler(title);
	var previous = context.attachmentUrls.get(title);
	if(!tiddler) {
		if(previous) {
			if(context.kit) context.kit.registerFile(title, null);
			URL.revokeObjectURL(previous.url);
			context.attachmentUrls.delete(title);
		}
		return null;
	}

	var fields = tiddler.fields;
	var text = fields.text || "";
	var type = fields.type || "application/octet-stream";
	var encoding = fields.encoding || "";
	if(!previous || previous.text !== text || previous.type !== type || previous.encoding !== encoding) {
		if(previous) URL.revokeObjectURL(previous.url);
		previous = {
			text: text,
			type: type,
			encoding: encoding,
			url: URL.createObjectURL(attachmentBlob(tiddler))
		};
		context.attachmentUrls.set(title, previous);
	}
	return {url: previous.url, mimeType: type};
}

function fileAttachmentForTiddler(context, title) {
	title += "";
	var attachment = resolveTiddlerAttachment(context, title);
	if(!attachment) throw new Error("File not found: " + title);
	context.kit.registerFile(title, {path: attachment.url, mimeType: attachment.mimeType});
	return context.kit.FileAttachment(title);
}

function activateScope(widget) {
	var context = widget.runtimeContext;
	if(widget.removed || context.disposed || widget.runtime || !context.notebookRuntime) return;
	widget.kit = context.kit;
	widget.runtime = widget.isRuntimeOwner ? context.notebookRuntime :
		scopedRuntime(context.notebookRuntime, context.notebookRuntime.runtime.module());
	widget.cells.forEach(function(cell) {
		widget.evaluateCell(cell);
	});
}

function startRuntime(context) {
	context.ready = loadNotebookKit().then(function(kit) {
		if(context.disposed) return context;
		context.kit = kit;
		var builtins = Object.assign({}, kit.library, {
			FileAttachment: function() {
				return function(title) { return fileAttachmentForTiddler(context, title); };
			}
		});
		context.notebookRuntime = new kit.NotebookRuntime(builtins);
		context.scopes.forEach(activateScope);
		return context;
	}).catch(function(error) {
		context.error = error;
		console.error("tc-notebook: failed to load Observable Notebook Kit", error);
		context.scopes.forEach(function(scope) {
			scope.cells.forEach(function(cell) {
				scope.showCellError(cell, "Could not load Observable Notebook Kit: " + error.message);
			});
		});
		return context;
	});
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

	var parentNotebook = findParentNotebook(this);
	if(parentNotebook) {
		this.runtimeContext = parentNotebook.runtimeContext;
		this.isRuntimeOwner = false;
	} else {
		this.runtimeContext = {
			wiki: this.wiki,
			scopes: new Set(),
			attachmentUrls: new Map(), // title -> {text, type, encoding, url}
			kit: null,
			notebookRuntime: null,
			ready: null,
			disposed: false,
			error: null
		};
		this.isRuntimeOwner = true;
	}
	this.runtimeContext.scopes.add(this);

	this.renderChildren(this.notebookRoot, null);
	this.reconcileCells();

	if(this.isRuntimeOwner) {
		startRuntime(this.runtimeContext);
	} else if(this.runtimeContext.error) {
		var error = this.runtimeContext.error;
		this.cells.forEach(function(cell) {
			this.showCellError(cell, "Could not load Observable Notebook Kit: " + error.message);
		}.bind(this));
	} else if(this.runtimeContext.ready) {
		this.runtimeContext.ready.then(function() { activateScope(this); }.bind(this));
	}
};

NotebookWidget.prototype.resolveTiddlerAttachment = function(title) {
	return resolveTiddlerAttachment(this.runtimeContext, title);
};

NotebookWidget.prototype.fileAttachmentForTiddler = function(title) {
	return fileAttachmentForTiddler(this.runtimeContext, title);
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
	// A parent notebook's DOM contains every nested notebook's hosts. Only the
	// nearest notebook root owns a host, otherwise parents would define child
	// cells in the wrong Observable module.
	return results.filter(function(host) {
		var owner = host.closest ? host.closest(".tc-notebook-widget") : null;
		return owner === root;
	});
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
		lastText: null,
		lastMode: null
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
	var mode = modeForTiddler(this.wiki, tiddler);

	cell.lastType = tiddler && tiddler.fields.type;
	cell.lastText = text;
	cell.lastMode = mode;

	if(!this.runtime || !this.kit) {
		return; // runtime still loading; will be evaluated once ready
	}

	clearCellVariables(cell);
	if(!mode) {
		// An unmapped type is intentionally not interpreted as JavaScript.
		cell.root.className = "tc-notebook-output-content";
		cell.root.textContent = "";
		return;
	}

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
	if(Object.keys(changedTiddlers).some(function(title) {
		return title.indexOf(TYPE_MAPPING_PREFIX) === 0;
	})) {
		this.cells.forEach(function(cell) {
			var tiddler = self.wiki.getTiddler(cell.title);
			if(modeForTiddler(self.wiki, tiddler) !== cell.lastMode) {
				self.evaluateCell(cell);
				any = true;
			}
		});
	}
	return any;
};

/* FileAttachment has no dependency edge back to the tiddler resolver. When a
   tiddler that was previously requested as an attachment changes, discard its
   Blob URL and re-run the notebook so consumers fetch the new contents. */
NotebookWidget.prototype.reevaluateChangedAttachments = function(changedTiddlers) {
	var context = this.runtimeContext;
	if(!context || !context.kit) return false;
	var changed = Object.keys(changedTiddlers).some(function(title) {
		var attachment = context.attachmentUrls.get(title);
		if(!attachment) return false;
		context.kit.registerFile(title, null);
		URL.revokeObjectURL(attachment.url);
		context.attachmentUrls.delete(title);
		return true;
	});
	if(changed) {
		context.scopes.forEach(function(scope) {
			if(scope.removed) return;
			scope.cells.forEach(function(cell) { scope.evaluateCell(cell); });
		});
	}
	return changed;
};

NotebookWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(changedAttributes.outputSelector || changedAttributes.titleAttribute) {
		this.refreshSelf();
		return true;
	}

	var childrenRefreshed = this.refreshChildren(changedTiddlers);
	var cellsChanged = this.reconcileCells();
	var attachmentsReevaluated = this.reevaluateChangedAttachments(changedTiddlers);
	var reevaluated = this.reevaluateChangedCells(changedTiddlers);

	return !!(childrenRefreshed || cellsChanged || attachmentsReevaluated || reevaluated);
};

NotebookWidget.prototype.destroy = function() {
	var self = this;
	this.removed = true;
	if(this.cells) {
		this.cells.forEach(function(cell) { self.disposeCell(cell); });
		this.cells.clear();
	}
	if(this.runtimeContext) {
		if(this.isRuntimeOwner && !this.runtimeContext.disposed) {
			this.runtimeContext.disposed = true;
			this.runtimeContext.scopes.forEach(function(scope) {
				if(scope === self) return;
				scope.removed = true;
				scope.cells.forEach(function(cell) { scope.disposeCell(cell); });
				scope.cells.clear();
			});
			if(this.runtimeContext.notebookRuntime && this.runtimeContext.notebookRuntime.dispose) {
				this.runtimeContext.notebookRuntime.dispose();
			}
			this.runtimeContext.attachmentUrls.forEach(function(attachment, title) {
				if(self.runtimeContext.kit) self.runtimeContext.kit.registerFile(title, null);
				URL.revokeObjectURL(attachment.url);
			});
			this.runtimeContext.attachmentUrls.clear();
			this.runtimeContext.scopes.clear();
		} else if(!this.isRuntimeOwner) {
			this.runtimeContext.scopes.delete(this);
		}
	}
	if(Widget.prototype.destroy) {
		Widget.prototype.destroy.call(this);
	}
};
