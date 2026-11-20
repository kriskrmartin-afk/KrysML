
/*
 * KrysBPM — BPMN 2.0 Text Parser
 * Version: v1 beta
 *
 * Converts numbered process text into a structured model.
 * Does not modify the existing KrysML renderer.
 */

const BPM_ENGINE_VERSION = '1.0.0-beta';

function safeId(value) {
  let s = String(value)
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .replace(/_+/g, '_');

  return /^[A-Za-z_]/.test(s) ? s : 'N_' + s;
}

function durationISO(text) {
  const s = String(text).trim();

  if (/^P(?=\d|T)[\dYMWDTHS.]+$/i.test(s)) {
    return s.toUpperCase();
  }

  const parts = Array.from(
    s.matchAll(
      /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)/gi
    )
  );

  if (!parts.length) return null;

  const found = { S: 0, M: 0, H: 0, D: 0, W: 0 };

  for (const [, count, unit] of parts) {
    const u = unit.toLowerCase();

    const key = u.startsWith('sec') ? 'S'
      : u.startsWith('min') ? 'M'
      : u.startsWith('h') ? 'H'
      : u.startsWith('d') ? 'D'
      : 'W';

    found[key] += Number(count);
  }

  const date =
    (found.W ? found.W + 'W' : '') +
    (found.D ? found.D + 'D' : '');

  const time =
    (found.H ? found.H + 'H' : '') +
    (found.M ? found.M + 'M' : '') +
    (found.S ? found.S + 'S' : '');

  return 'P' + date + (time ? 'T' + time : '');
}

function parseProcess(code, title = 'Process') {
  const roots = [];
  const all = [];
  const byToken = new Map();
  const warnings = [];
  const seen = new Set();

  let lastNode = null;
  let lastNumbered = null;
  let dashLevels = [];

  const rows = String(code || '').split(/\r?\n/);

  for (let index = 0; index < rows.length; index++) {
    const raw = rows[index];

    let line = raw.split('#')[0].trim();
    if (!line) continue;

    line = line
      .replace(/^\*\s+(?=\d+[.])/, '')
      .replace(/^[-]\s+(?=\d+[.])/, '');

    const numbered = line.match(
      /^(\d+(?:\.[A-Za-z0-9_-]+)*)\.\s*(.*)$/
    );

    const dashed = !numbered &&
      line.match(/^(-{1,})\s+(.+)$/);


    const jumpMatch = line.match(
      /^(?:loop|go)\s+to\s*:?\s*(\S+)/i
    );


    if (!numbered && !dashed && !jumpMatch) {
      continue;
    }

    let token = null;
    let depth = 0;
    let parent = null;
    let content = '';
    let dashCount = 0;

    if (numbered) {
      token = numbered[1];
      content = numbered[2].trim();

      const path = token.split('.');
      depth = path.length - 1;

      if (seen.has(token)) {
        warnings.push(
          `Line ${index + 1}: repeated step ${token} ignored (gateways close automatically).`
        );
        continue;
      }

      if (depth) {
        const pToken = path.slice(0, -1).join('.');
        parent = byToken.get(pToken) || null;

        if (!parent) {
          warnings.push(
            `Line ${index + 1}: parent ${pToken} not found; step placed at process level.`
          );
          depth = 0;
        }
      }

      lastNumbered = token;

    } else if (dashed) {
      dashCount = dashed[1].length;
      content = dashed[2].trim();

      if (dashCount === 1) {
        const anchor =
          dashLevels[0] || byToken.get(lastNumbered);

        if (!anchor || anchor.kind !== 'gateway') {
          warnings.push(
            `Line ${index + 1}: dash branches need a preceding numbered GATEWAY; line ignored.`
          );
          continue;
        }

        dashLevels = [anchor];
      }

      parent = dashLevels[dashCount - 1] || null;

      if (!parent) {
        warnings.push(
          `Line ${index + 1}: missing nesting level; attached to nearest available level.`
        );
        parent = dashLevels[dashLevels.length - 1] || null;
      }

      if (!parent) continue;

      depth = parent.depth + 1;
      token = 'dash_' + (index + 1);

    } else {
      if (!lastNode) {
        warnings.push(
          `Line ${index + 1}: jump has no preceding step.`
        );
        continue;
      }

      lastNode.redirect = {
        type: /^loop/i.test(line) ? 'loop' : 'goto',
        target: jumpMatch[1].replace(/\.$/, '')
      };

      continue;
    }

    if (!content) continue;


    const jump = content.match(
      /^(loop|go)\s+to\s*:?\s*(\S+)/i
    );


    const mods = Array.from(
      content.matchAll(/~([\w-]+)/gi),
      m => m[1].toLowerCase()
    );

    // Only the first @ assignment is used.
    const laneMatch = content.match(/@([^\s@~#]+)/);
    const lane = laneMatch
      ? laneMatch[1].replace(/_/g, ' ')
      : null;

    content = content
      .replace(/~[\w-]+/g, '')
      .replace(/@[^\s@~#]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    let branchLabel = '';

    const choice = content.match(
      /^(yes|no)\s*(?::\s*|$)(.*)$/i
    );

    if (choice) {
      branchLabel = choice[1].toUpperCase();
      content = choice[2].trim();
    }

    const key =
      content.match(
        /^(start|end|event|wait|gateway)\s*:\s*(.*)$/i
      ) ||
      content.match(/^(start|end)$/i);

    const keyword = key
      ? key[1].toLowerCase()
      : '';

    const label = key
      ? (key[2] || '').trim()
      : content;

    const kind = jump ? 'jump'
      : keyword === 'start' ? 'start'
      : keyword === 'end' ? 'end'
      : keyword === 'gateway' ? 'gateway'
      : keyword === 'wait' ||
        keyword === 'event' ||
        mods.includes('throw') ||
        mods.includes('catch') ? 'event'
      : 'task';

    const gatewayType = mods.includes('and') ? 'and'
      : mods.includes('or') ? 'or'
      : 'xor';

    const eventType =
      keyword === 'wait' || mods.includes('wait')
        ? 'timer'
      : mods.includes('email')
        ? 'message'
      : mods.includes('error')
        ? 'error'
      : 'none';

    const eventDirection = mods.includes('throw')
      ? 'throw'
      : 'catch';

    const taskTypes = [
      'user',
      'script',
      'service',
      'manual',
      'businessrule',
      'business_rule',
      'send',
      'receive'
    ];

    const type =
      mods.find(m => taskTypes.includes(m)) || 'task';

    const node = {
      id: 'Step_' + safeId(token),
      token,
      index: index + 1,
      depth,
      parent,
      children: [],
      kind,

      label: label || (
        kind === 'gateway' ? 'Decision'
        : kind === 'start' ? 'Start'
        : kind === 'end' ? 'End'
        : kind === 'jump' ? ''
        : 'Activity'
      ),

      original: content,
      branchLabel,
      modifiers: mods,
      lane,
      taskType: type,
      gatewayType,
      eventType,
      eventDirection,

      note: mods.includes('sub_task')
        ? 'sub_task'
        : '',

      redirect: jump
        ? {
            type: jump[1].toLowerCase() === 'loop'
              ? 'loop'
              : 'goto',
            target: jump[2].replace(/\.$/, '')
          }
        : null
    };

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    all.push(node);
    lastNode = node;

    if (numbered) {
      seen.add(token);
      byToken.set(token, node);

      if (node.kind === 'gateway') {
        dashLevels = [node];
      } else {
        const chain = [];
        let p = node.parent;

        while (p && p.kind !== 'gateway') {
          chain.unshift(p);
          p = p.parent;
        }

        if (p && p.kind === 'gateway') {
          dashLevels = [p, ...chain, node];
        } else {
          dashLevels = [];
        }
      }

    } else if (dashed) {
      dashLevels[dashCount] = node;
      dashLevels = dashLevels.slice(0, dashCount + 1);
    }

    if (
      node.kind === 'event' &&
      node.eventType === 'timer' &&
      !durationISO(node.label)
    ) {
      warnings.push(
        `Line ${index + 1}: timer duration '${node.label}' is not recognised; XML will not include a timed duration.`
      );
    }
  }

  return {
    title,
    roots,
    all,
    byToken,
    warnings
  };
}


/*
 * KrysBPM — Step 5B (v1 beta release (15th Nov 2026)): Process Graph Builder
 *
 * Input: parsed model from parseProcess()
 * Output: connected BPMN nodes and edges
 *
 * This does not render SVG or modify existing diagrams.
 */

function buildProcessGraph(parsed) {
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();
  const warnings = [...parsed.warnings];
  const pending = [];

  
// Normalise references without changing displayed step IDs.
function normaliseStepToken(token) {
  return String(token)
    .trim()
    .replace(/\.$/, '')
    .split('.')
    .map(part => {
      if (/^\d+$/.test(part)) {
        return part.replace(/^0+(?=\d)/, '');
      }
      return part.toLowerCase();
    })
    .join('.');
}

// Build an index of normalised step references.
const referenceIndex = new Map();

for (const [token, node] of parsed.byToken) {
  const key = normaliseStepToken(token);

  if (!referenceIndex.has(key)) {
    referenceIndex.set(key, []);
  }

  referenceIndex.get(key).push(node);
}

// Report ambiguous identifiers without interrupting editing.
for (const [key, matches] of referenceIndex) {
  if (matches.length > 1) {
    warnings.push(
      `Ambiguous step identifier '${key}': ` +
      matches.map(n => n.token).join(', ')
    );
  }
}


  let serial = 1;

  // Register each node only once.
  function addNode(node) {
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
      nodes.push(node);
    }

    return node.id;
  }

  // Record a directed connection between nodes.
  function connect(source, target, label = '', kind = 'sequence') {
    if (!source || !target) return;

    edges.push({
      id: 'Flow_' + serial++,
      source,
      target,
      label,
      kind
    });
  }

  // Convert a step and any nested children into a graph segment.
  function compileNode(step) {

    if (step.kind === 'jump') {
      return {
        entry: null,
        exits: [],
        directive: step.redirect
      };
    }

    addNode(step);

    // End events cannot continue to another step.
    let exits = step.kind === 'end' ? [] : [step.id];

    // A gateway with nested branches.
   
if (step.kind === 'gateway' && step.children.length) {
  const branches = step.children;

  const choiceLabels = branches.map(
    branch => branch.branchLabel || ''
  );

  // Infer YES/NO labels on two-way XOR gateways.
  if (step.gatewayType === 'xor' && branches.length === 2) {
    if (!choiceLabels[0]) {
      choiceLabels[0] =
        choiceLabels[1] === 'YES' ? 'NO' : 'YES';
    }

    if (!choiceLabels[1]) {
      choiceLabels[1] =
        choiceLabels[0] === 'YES' ? 'NO' : 'YES';
    }
  }

  // Compile branches before deciding whether a merge is needed.
  const continuing = [];

  for (let i = 0; i < branches.length; i++) {
    const child = branches[i];
    const choice = choiceLabels[i] || '';

    // An empty branch continues directly from the gateway.
    if (!child.label ||
        (child.label === 'Activity' && !child.original)) {
      continuing.push(step.id);
      continue;
    }

    const part = compileNode(child);

    if (part.entry) {
      connect(step.id, part.entry, choice);
    } else if (part.directive) {
      pending.push({
        sources: [step.id],
        ...part.directive
      });
    }

    // Only branches that can continue contribute exits.
    continuing.push(...part.exits);
  }

  if (branches.length === 1) {
    warnings.push(
      `Gateway ${step.token} has only one branch.`
    );
  }

  if (continuing.length > 1) {
    // Multiple continuing paths require a matching merge.
    const merge = {
      id: 'Merge_' + safeId(step.token),
      kind: 'gateway',
      gatewayType: step.gatewayType,
      label: '',
      token: 'merge',
      lane: step.lane,
      merge: true
    };

    addNode(merge);

    for (const exit of continuing) {
      connect(exit, merge.id);
    }

    exits = [merge.id];

  } else {
    // Zero or one continuing path: no merge required.
    exits = continuing;
  }

    } else if (step.children.length) {

      // Normal steps may have nested activities.
      if (step.kind === 'end') {
        warnings.push(
          `Step ${step.token}: END cannot contain child steps.`
        );
      } else {
        const nested = compileSequence(step.children);

        if (nested.entry) {
          connect(step.id, nested.entry);
          exits = nested.exits;
        }
      }

    } else if (step.kind === 'gateway') {

      warnings.push(
        `Gateway ${step.token} has no nested branches.`
      );
    }

    // A loop or jump leaves the normal sequence.
    if (step.redirect) {
      if (!exits.length) {
        warnings.push(
          `Line ${step.index}: jump follows a terminal step.`
        );
      } else {
        pending.push({
          sources: [...exits],
          ...step.redirect
        });
      }

      exits = [];
    }

    return {
      entry: step.id,
      exits
    };
  }

  // Connect consecutive steps in a sequence.
  function compileSequence(steps) {
    let first = null;
    let previous = [];

    for (const step of steps) {

      if (step.kind === 'jump') {
        if (!previous.length) {
          warnings.push(
            `Line ${step.index}: jump has no preceding flow.`
          );
        } else {
          pending.push({
            sources: [...previous],
            ...step.redirect
          });
        }

        previous = [];
        continue;
      }

      const segment = compileNode(step);

      if (!first) {
        first = segment.entry;
      }

      for (const source of previous) {
        connect(source, segment.entry);
      }

      previous = segment.exits;
    }

    return {
      entry: first,
      exits: previous
    };
  }

  // Build the main process.
  compileSequence(parsed.roots);

  // Resolve loops and jumps after all nodes exist.
  // This supports nested targets like 60.b.a.
  for (const jump of pending) {
    const targetToken = jump.target.replace(/\.$/, '');

    
    const matches =
      referenceIndex.get(normaliseStepToken(targetToken)) || [];

    const destination =
      matches.length === 1 ? matches[0] : null;


    if (
      !destination ||
      !nodeMap.has(destination.id) ||
      destination.kind === 'jump'
    ) {
      warnings.push(
        `Cannot resolve ${jump.type} target '${jump.target}'.`
      );
      continue;
    }

    for (const source of jump.sources) {
      connect(
        source,
        destination.id,
        '',
        jump.type
      );
    }
  }


// Console diagnostics only; never interrupt the editor.
if (warnings.length) {
  console.groupCollapsed(
    `KrysBPM: ${warnings.length} graph diagnostic(s)`
  );
  warnings.forEach(message => console.warn(message));
  console.groupEnd();
}


  return {
    title: parsed.title,
    nodes,
    edges,
    nodeMap,
    warnings
  };
}

// need this for tsting in dev tools
window.KrysBPMParser = {
  version: BPM_ENGINE_VERSION,
  parseProcess,
  buildProcessGraph,
  durationISO
};


console.log(
  'KrysBPM parser ' + BPM_ENGINE_VERSION + ' loaded'
);
