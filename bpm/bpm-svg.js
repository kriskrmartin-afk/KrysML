
/*
 * KrysBPM — SVG Rendering Engine
 * Step 5C.1 — Basic BPMN symbols and Dagre layout
 * Version: v1 beta
 *
 * This renderer is independent of the KrysML renderer.
 * No external network resources.
 */

(() => {
  'use strict';

  const BPM_SVG_VERSION = '1.0.0-beta';
  const NS = 'http://www.w3.org/2000/svg';


  const COLORS = {
    task: '#e8f2f7',
    taskBorder: '#66879b',
    gateway: '#fff3df',
    gatewayBorder: '#b88032',
    event: '#ffffff',
    eventBorder: '#55778c',
    connector: '#7c8999',
    loop: '#888888',
    text: '#263747'
  };

  // Safely create SVG elements.
  function element(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(NS, tag);

    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }

    if (parent) parent.appendChild(el);
    return el;
  }

  function text(parent, x, y, value, attrs = {}) {
    const el = element('text', {
      x,
      y,
      fill: COLORS.text,
      'font-size': 13,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      ...attrs
    }, parent);

    el.textContent = String(value || '');
    return el;
  }


/*
 * KrysBPM — Two-line SVG text wrapping
 *
 * Keeps node dimensions fixed.
 * Uses canvas measurement for accurate line widths.
 * Preserves the original text in the process model.
 */

function wrappedText(
  parent,
  x,
  y,
  value,
  maxWidth = 155,
  maxLines = 2
) {
  const fullText = String(value ?? '').trim();
  const fontSize = 12;
  const lineHeight = 16;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.font = `${fontSize}px Arial, sans-serif`;
  }

  const measure = str =>
    ctx ? ctx.measureText(str).width : str.length * 7;

  const words = fullText.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current
      ? current + ' ' + word
      : word;

    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);

  // Handle a single word longer than the available width.
  for (let i = 0; i < lines.length; i++) {
    if (measure(lines[i]) > maxWidth) {
      let remaining = lines[i];
      const pieces = [];

      while (remaining.length) {
        let count = 1;

        while (
          count < remaining.length &&
          measure(remaining.slice(0, count + 1)) <= maxWidth
        ) {
          count++;
        }

        pieces.push(remaining.slice(0, count));
        remaining = remaining.slice(count);
      }

      lines.splice(i, 1, ...pieces);
      i += pieces.length - 1;
    }
  }

  // Truncate after the permitted number of lines.
  const truncated = lines.length > maxLines;
  const visible = lines.slice(0, maxLines);

  if (truncated && visible.length) {
    let last = visible[maxLines - 1];

    while (
      last.length &&
      measure(last + '…') > maxWidth
    ) {
      last = last.slice(0, -1);
    }

    visible[maxLines - 1] = last.trimEnd() + '…';
  }

  const group = element('g', {}, parent);

  const firstY =
    y - ((visible.length - 1) * lineHeight) / 2;

  visible.forEach((line, index) => {
    text(
      group,
      x,
      firstY + index * lineHeight,
      line,
      {
        'font-size': fontSize,
        'font-family': 'Arial, sans-serif'
      }
    );
  });

  return group;
}


  // BPMN node dimensions.
  function bounds(node) {
    if (node.kind === 'task') {
      return { width: 190, height: 64 };
    }

    if (node.kind === 'gateway') {
      return { width: 58, height: 58 };
    }

    return { width: 48, height: 48 };
  }

  // Position all nodes using the existing Dagre library.
  function layout(graph) {
    if (!window.dagre) {
      throw new Error('Dagre is not loaded.');
    }

    const g = new dagre.graphlib.Graph({
      multigraph: true
    });

    g.setGraph({
      rankdir: 'TB',
      ranksep: 85,
      nodesep: 110,
      edgesep: 35,
      marginx: 110,
      marginy: 90,
      acyclicer: 'greedy'
    });

    g.setDefaultEdgeLabel(() => ({}));

    for (const node of graph.nodes) {
      g.setNode(node.id, bounds(node));
    }

    // Loopbacks are drawn separately so they do not
    // force Dagre to reverse or rearrange the tree.
    for (const edge of graph.edges) {
      if (edge.kind !== 'sequence') continue;

      g.setEdge(
        edge.source,
        edge.target,
        { weight: 1, minlen: 1 },
        edge.id
      );
    }

    dagre.layout(g);

    const positions = {};

    for (const node of graph.nodes) {
      const p = g.node(node.id);
      const b = bounds(node);

      positions[node.id] = {
        x: p.x,
        y: p.y,
        width: b.width,
        height: b.height
      };
    }

    return { g, positions };
  }

  // Draw basic BPMN task markers.
  function taskMarker(group, node, x, y) {
    const type = node.taskType || 'task';

    const symbols = {
      user: '♙',
      script: '📜',
      service: '⚙',
      manual: '✋',
      send: '✉',
      receive: '✉',
      businessrule: '▤',
      business_rule: '▤'
    };

    if (symbols[type]) {
      text(group, x, y, symbols[type], {
        'font-size': 18
      });
    }
  }

  // Draw event type markers.
  function eventMarker(group, node, x, y) {
    const type = node.eventType || 'none';

    if (type === 'timer') {
      element('circle', {
        cx: x,
        cy: y,
        r: 12,
        fill: 'none',
        stroke: COLORS.eventBorder,
        'stroke-width': 1.4
      }, group);

      element('path', {
        d: `M ${x} ${y - 8} V ${y} L ${x + 6} ${y + 4}`,
        fill: 'none',
        stroke: COLORS.eventBorder,
        'stroke-width': 1.4
      }, group);

    } else if (type === 'message') {
      element('rect', {
        x: x - 12,
        y: y - 8,
        width: 24,
        height: 16,
        fill: 'none',
        stroke: COLORS.eventBorder
      }, group);

      element('path', {
        d: `M ${x - 12} ${y - 8} L ${x} ${y + 2}
            L ${x + 12} ${y - 8}`,
        fill: 'none',
        stroke: COLORS.eventBorder
      }, group);

    } else if (type === 'error') {
      text(group, x, y, 'ϟ', {
        'font-size': 25
      });
    }
  }

  // Draw one BPMN node.
  function drawNode(svg, node, p) {
    const g = element('g', {
      'data-node-id': node.id
    }, svg);

     // Preserve the full description for hover.
     const tooltip = element('title', {}, g);

     tooltip.textContent =
       node.label || node.token || 'BPMN element';

      const x = p.x;
      const y = p.y;

      
    if (node.kind === 'task') {
      element('rect', {
        x: x - p.width / 2,
        y: y - p.height / 2,
        width: p.width,
        height: p.height,
        rx: 10,
        fill: COLORS.task,
        stroke: COLORS.taskBorder,
        'stroke-width': 1.7
      }, g);

      taskMarker(
        g,
        node,
        x - p.width / 2 + 18,
        y - p.height / 2 + 18
      );


      wrappedText(
        g,
        x,
        y + 5,
        node.label,
        p.width - 40,
        2
      );


    } else if (node.kind === 'gateway') {
      const r = p.width / 2;

      element('path', {
        d: `M ${x} ${y - r}
            L ${x + r} ${y}
            L ${x} ${y + r}
            L ${x - r} ${y} Z`,
        fill: COLORS.gateway,
        stroke: COLORS.gatewayBorder,
        'stroke-width': 2
      }, g);

      const symbol =
        node.gatewayType === 'and' ? '+'
        : node.gatewayType === 'or' ? 'O'
        : 'X';

      text(g, x, y + 1, symbol, {
        'font-size': 24,
        'font-weight': 'bold',
        fill: COLORS.gatewayBorder
      });

      if (!node.merge && node.label) {
        text(g, x + r + 18, y, node.label, {
          'font-size': 12,
          'font-weight': 'bold',
          'text-anchor': 'start'
        });
      }

    } else {
      // Start, intermediate and end events.
      const r = p.width / 2;

      element('circle', {
        cx: x,
        cy: y,
        r,
        fill: COLORS.event,
        stroke: COLORS.eventBorder,
        'stroke-width': node.kind === 'end' ? 3.5 : 1.7
      }, g);

      if (node.kind === 'event') {
        element('circle', {
          cx: x,
          cy: y,
          r: r - 4,
          fill: 'none',
          stroke: COLORS.eventBorder,
          'stroke-width': 1
        }, g);
      }

      if (node.kind === 'event' || node.kind === 'end') {
        eventMarker(g, node, x, y);
      }


      text(g, x + r + 18, y + 2, node.label, {
        'font-size': 12,
        'text-anchor': 'start'
      });

    }

    // Display source step numbers without changing IDs.
    if (node.token && !node.merge) {
      text(
        g,
        x + p.width / 2 + 9,
        y - p.height / 2 - 5,
        node.token,
        {
          'text-anchor': 'start',
          'font-size': 10,
          fill: '#708294'
        }
      );
    }
  }

  function drawEdge(svg, edge, positions, dagreGraph) {
    const from = positions[edge.source];
    const to = positions[edge.target];

    if (!from || !to) return;

    let path;
    let labelX;
    let labelY;

    if (edge.kind === 'sequence') {
      const route = dagreGraph.edge({
        v: edge.source,
        w: edge.target,
        name: edge.id
      });

      const points = route?.points || [];

      if (points.length) {
        path = points.map((p, i) =>
          `${i ? 'L' : 'M'} ${p.x} ${p.y}`
        ).join(' ');


      const first = points[0];
      const second = points[1] || points[0];

      // Position branch labels near the beginning of the flow,
      // away from the bend approaching the next activity.
      labelX = first.x + (second.x - first.x) * 0.4;
      labelY = first.y + (second.y - first.y) * 0.4 - 15;


      } else {
        path = `M ${from.x} ${from.y}
                L ${to.x} ${to.y}`;

        labelX = (from.x + to.x) / 2;
        labelY = (from.y + to.y) / 2;
      }

    } else {
      // Beta loop/jump routing: right-hand return channel.
      const right = Math.max(
        from.x + from.width / 2,
        to.x + to.width / 2
      ) + 80;

      const startX = from.x + from.width / 2;
      const endX = to.x + to.width / 2;

      path = `M ${startX} ${from.y}
              H ${right}
              V ${to.y}
              H ${endX}`;

      labelX = right - 17;
      labelY = (from.y + to.y) / 2;
    }

    element('path', {
      d: path,
      fill: 'none',
      stroke: edge.kind === 'sequence'
        ? COLORS.connector
        : COLORS.loop,
      'stroke-width': 1.7,
      'marker-end': 'url(#bpm-arrow)'
    }, svg);

    if (edge.label) {
      const colour = edge.label === 'YES'
        ? '#15956b'
        : edge.label === 'NO'
        ? '#cf4a4a'
        : COLORS.text;

      text(svg, labelX, labelY, edge.label, {
        fill: colour,
        'font-size': 11
      });
    }
  }

  // Convert the process graph into a standalone SVG.
  function render(graph) {
    const { g, positions } = layout(graph);

    const values = Object.values(positions);

    const maxX = Math.max(
      800,
      ...values.map(p => p.x + p.width / 2 + 160)
    );

    const maxY = Math.max(
      550,
      ...values.map(p => p.y + p.height / 2 + 110)
    );

    const svg = element('svg', {
      xmlns: NS,
      viewBox: `0 0 ${maxX} ${maxY}`,
      width: maxX,
      height: maxY,
      'data-renderer': 'KrysBPM-v1-beta'
    });

    const defs = element('defs', {}, svg);

    const marker = element('marker', {
      id: 'bpm-arrow',
      markerWidth: 9,
      markerHeight: 9,
      refX: 8,
      refY: 4.5,
      orient: 'auto',
      markerUnits: 'strokeWidth'
    }, defs);

    element('path', {
      d: 'M 0 0 L 8 4.5 L 0 9 Z',
      fill: COLORS.connector
    }, marker);

    // Draw connectors first, then symbols above them.
    for (const edge of graph.edges) {
      drawEdge(svg, edge, positions, g);
    }

    for (const node of graph.nodes) {
      drawNode(svg, node, positions[node.id]);
    }

    return svg;
  }

  // Temporary preview window within the current page.
  function preview(graph) {
    document.getElementById('bpm-svg-preview')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bpm-svg-preview';

    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '99999',
      background: '#ffffff',
      overflow: 'auto',
      padding: '65px 20px 20px'
    });

    const close = document.createElement('button');
    close.textContent = 'Close BPMN Preview';

    Object.assign(close.style, {
      position: 'fixed',
      top: '12px',
      right: '20px',
      zIndex: '100000',
      padding: '10px 16px',
      cursor: 'pointer'
    });

    close.onclick = () => overlay.remove();

    overlay.appendChild(close);
    overlay.appendChild(render(graph));

    document.body.appendChild(overlay);
  }


      window.KrysBPMSVG = {
        render,
        preview,
        layout,
        version: BPM_SVG_VERSION
      };

      console.log(
        'KrysBPM SVG ' + BPM_SVG_VERSION + ' loaded'
      );

})();
