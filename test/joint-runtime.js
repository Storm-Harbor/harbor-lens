// Unit boundary for the external SVG engine. Browser acceptance uses the real
// @joint/core runtime and verifies its SVG, links, selection and viewport.
export const papers = [];
class Cell {
  static define(type) {
    return class extends Cell {
      constructor(options) {
        super({ ...options, type });
      }
    };
  }
  constructor(options) {
    Object.assign(this, options);
    this.attributes = options.attrs;
  }
  attr(next) {
    for (const [key, value] of Object.entries(next))
      this.attributes[key] = { ...this.attributes[key], ...value };
  }
}
export const shapes = { standard: { Rectangle: Cell, Link: Cell } };
export const dia = {
  Graph: class {
    resetCells(cells) {
      this.cells = cells;
    }
    getCell(id) {
      return this.cells.find((cell) => cell.id === id);
    }
    clear() {
      this.cells = [];
    }
  },
  Paper: class {
    constructor(options) {
      this.options = options;
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      options.el.append(this.svg);
      this.events = {};
      papers.push(this);
    }
    on(name, handler) {
      this.events[name] = handler;
    }
    scale(value) {
      this.zoom = value;
    }
    translate(value) {
      this.pan = value;
    }
    remove() {
      this.options.el.remove();
      this.removed = true;
    }
  },
};
