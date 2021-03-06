// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
'use strict';

import {
  IRenderMime
} from 'jupyterlab/lib/rendermime';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  Panel
} from 'phosphor/lib/ui/panel';

import {
  createNbdimeMergeView
} from '../../common/mergeview';

import {
  FlexPanel
} from '../../upstreaming/flexpanel';

import {
  CollapsiblePanel
} from '../../common/collapsiblepanel';

import {
  valueIn
} from '../../common/util';

import {
  DIFF_CLASSES, ADDED_DIFF_CLASS, DELETED_DIFF_CLASS,
  TWOWAY_DIFF_CLASS, UNCHANGED_DIFF_CLASS
} from './common';

import {
  RenderableOutputView
} from './output';

import {
  CellDiffModel, IDiffModel, StringDiffModel, OutputDiffModel,
  ImmutableDiffModel
} from '../model';


/**
 * The class name added to the prompt area of cell.
 */
const PROMPT_CLASS = 'jp-Cell-prompt';


const CELLDIFF_CLASS = 'jp-Cell-diff';

const SOURCE_ROW_CLASS = 'jp-Cellrow-source';
const METADATA_ROW_CLASS = 'jp-Cellrow-metadata';
const OUTPUTS_ROW_CLASS = 'jp-Cellrow-outputs';

const ADD_DEL_LABEL_CLASS = 'jp-Diff-label';

/**
 * A list of MIME types that can be shown as string diff.
 */
const stringDiffMimeTypes = ['text/html', 'text/plain', 'application/json'];



/**
 * CellDiffWidget for cell changes
 */
export
class CellDiffWidget extends Panel {
  /**
   *
   */
  constructor(model: CellDiffModel, rendermime: IRenderMime,
              mimetype: string) {
    super();
    this.addClass(CELLDIFF_CLASS);
    this._model = model;
    this._rendermime = rendermime;
    this.mimetype = mimetype;

    this.init();
  }

  protected init() {
    let model = this.model;

    // Add 'cell added/deleted' notifiers, as appropriate
    let CURR_DIFF_CLASSES = DIFF_CLASSES.slice();  // copy
    if (model.added) {
      let widget = new Widget();
      widget.node.textContent = 'Cell added';
      widget.addClass(ADD_DEL_LABEL_CLASS);
      this.addWidget(widget);
      this.addClass(ADDED_DIFF_CLASS);
      CURR_DIFF_CLASSES = DIFF_CLASSES.slice(1, 2);
    } else if (model.deleted) {
      let widget = new Widget();
      widget.node.textContent = 'Cell deleted';
      widget.addClass(ADD_DEL_LABEL_CLASS);
      this.addWidget(widget);
      this.addClass(DELETED_DIFF_CLASS);
      CURR_DIFF_CLASSES = DIFF_CLASSES.slice(0, 1);
    } else if (model.unchanged) {
      this.addClass(UNCHANGED_DIFF_CLASS);
    } else {
      this.addClass(TWOWAY_DIFF_CLASS);
    }

    // Add inputs and outputs, on a row-by-row basis
    let sourceView = CellDiffWidget.createView(
      model.source, model, CURR_DIFF_CLASSES, this._rendermime);
    sourceView.addClass(SOURCE_ROW_CLASS);
    if (model.executionCount) {
      sourceView.insertWidget(0, CellDiffWidget.createPrompts(
        model.executionCount, model));
    }
    this.addWidget(sourceView);

    if (!model.metadata.unchanged) {
      let metadataView = CellDiffWidget.createView(
        model.metadata, model, CURR_DIFF_CLASSES, this._rendermime);
      metadataView.addClass(METADATA_ROW_CLASS);
      this.addWidget(metadataView);
    }
    if (model.outputs && model.outputs.length > 0) {
      let container = new Panel();
      let changed = false;
      for (let o of model.outputs) {
        let outputsWidget = CellDiffWidget.createView(
          o, model, CURR_DIFF_CLASSES, this._rendermime);
        container.addWidget(outputsWidget);
        changed = changed || !o.unchanged || o.added || o.deleted;
      }
      if (model.added || model.deleted) {
        container.addClass(OUTPUTS_ROW_CLASS);
        this.addWidget(container);
      } else {
        let collapsed = !changed;
        let header = changed ? 'Outputs changed' : 'Outputs unchanged';
        let collapser = new CollapsiblePanel(container, header, collapsed);
        collapser.addClass(OUTPUTS_ROW_CLASS);
        this.addWidget(collapser);
      }
    }
  }

  static createPrompts(model: ImmutableDiffModel, parent: CellDiffModel): Panel {
    let prompts: string[] = [];
    if (!parent.added) {
      let base = model.base as number | null;
      let baseStr = `In [${base || ' '}]:`;
      prompts.push(baseStr);
    }
    if (!parent.unchanged && !parent.deleted) {
      let remote = model.remote as number | null;
      let remoteStr = `In [${remote || ' '}]:`;
      prompts.push(remoteStr);
    }
    let container = new FlexPanel({direction: 'left-to-right'});
    for (let text of prompts) {
      let w = new Widget();
      w.node.innerText = text;
      w.addClass(PROMPT_CLASS);
      container.addWidget(w);
      FlexPanel.setGrow(w, 1);
    }
    return container;
  }

  /**
   * Create a new sub-view.
   */
  static
  createView(model: IDiffModel, parent: CellDiffModel,
             editorClasses: string[], rendermime: IRenderMime): Panel {
    let view: Widget | null = null;
    if (model instanceof StringDiffModel) {
      if (model.unchanged && parent.cellType === 'markdown') {
        view = rendermime.render({bundle: {'text/markdown': model.base!}});
      } else {
        view = createNbdimeMergeView(model, editorClasses);
      }
    } else if (model instanceof OutputDiffModel) {
      // Take one of three actions, depending on output types
      // 1) Text-type output: Show a MergeView with text diff.
      // 2) Renderable types: Side-by-side comparison.
      // 3) Unknown types: Stringified JSON diff.
      let renderable = RenderableOutputView.canRenderUntrusted(model);
      for (let mt of rendermime.order) {
        let key = model.hasMimeType(mt);
        if (key) {
          if (!renderable || valueIn(mt, stringDiffMimeTypes)) {
            // 1.
            view = createNbdimeMergeView(model.stringify(key), editorClasses);
          } else if (renderable) {
            // 2.
            view = new RenderableOutputView(model, editorClasses, rendermime);
          }
          break;
        }
      }
      if (!view) {
        // 3.
        view = createNbdimeMergeView(model.stringify(), editorClasses);
      }
    } else {
      throw new Error('Unrecognized model type.');
    }
    if (model.collapsible) {
      view = new CollapsiblePanel(
          view, model.collapsibleHeader, model.startCollapsed);
    }
    let container = new Panel();
    if (model instanceof OutputDiffModel) {
      if (model.added) {
        if (!parent.added) {
          // Implies this is added output
          let addSpacer = new Widget();
          addSpacer.node.textContent = 'Output added';
          addSpacer.addClass(ADD_DEL_LABEL_CLASS);
          container.addWidget(addSpacer);
        }
        container.addClass(ADDED_DIFF_CLASS);
      } else if (model.deleted) {
        if (!parent.deleted) {
          // Implies this is deleted output
          let delSpacer = new Widget();
          delSpacer.node.textContent = 'Output deleted';
          delSpacer.addClass(ADD_DEL_LABEL_CLASS);
          container.addWidget(delSpacer);
        }
        container.addClass(DELETED_DIFF_CLASS);
      } else if (model.unchanged) {
        container.addClass(UNCHANGED_DIFF_CLASS);
      } else {
        container.addClass(TWOWAY_DIFF_CLASS);
      }
    }
    container.addWidget(view);
    return container;
  }


  mimetype: string;

  /**
   * Get the model for the widget.
   *
   * #### Notes
   * This is a read-only property.
   */
  get model(): CellDiffModel {
    return this._model;
  }

  protected _model: CellDiffModel;
  protected _rendermime: IRenderMime;
}
