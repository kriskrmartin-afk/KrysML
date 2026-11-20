
/*
 * KrysBPM — BPMN 2.0 XML Exporter
 * Version: v1 beta
 *
 * Step 5D.1: Semantic BPMN XML
 * Step 5D.2 will add diagram coordinates (BPMN DI).
 *
 * No external libraries or network requests.
 */

(() => {
  'use strict';

  const BPM_EXPORT_VERSION = '1.0.0-beta';

  const NS = {
    bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
    bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
    dc: 'http://www.omg.org/spec/DD/20100524/DC',
    di: 'http://www.omg.org/spec/DD/20100524/DI'
  };

  // Convert internal node types into BPMN XML element names.
  function nodeType(node) {

    if (node.kind === 'start') return 'startEvent';
    if (node.kind === 'end') return 'endEvent';

    if (node.kind === 'gateway') {
      if (node.gatewayType === 'and') {
        return 'parallelGateway';
      }

      if (node.gatewayType === 'or') {
        return 'inclusiveGateway';
      }

      return 'exclusiveGateway';
    }

    if (node.kind === 'event') {
      return node.eventDirection === 'throw'
        ? 'intermediateThrowEvent'
        : 'intermediateCatchEvent';
    }

    const types = {
      user: 'userTask',
      script: 'scriptTask',
      service: 'serviceTask',
      manual: 'manualTask',
      send: 'sendTask',
      receive: 'receiveTask',
      businessrule: 'businessRuleTask',
      business_rule: 'businessRuleTask'
    };

    return types[node.taskType] || 'task';
  }


/*
 * Step 5D.2A — BPMN Diagram Interchange
 *
 * Generates a horizontal BPMN layout independently
 * from KrysBPM's vertical SVG renderer.
 */

function buildDiagram(graph, doc, root) {

  if (!window.dagre) {
    throw new Error('Dagre is required for BPMN export.');
  }

  // Create a namespaced XML element.
  function diElement(parent, namespace, prefix, tag, attrs = {}) {
    const el = doc.createElementNS(
      namespace,
      prefix + ':' + tag
    );

    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }

    parent.appendChild(el);
    return el;
  }

  // Standard BPMN diagram dimensions.
  function dimensions(node) {
    if (node.kind === 'task') {
      return { width: 130, height: 80 };
    }

    if (node.kind === 'gateway') {
      return { width: 50, height: 50 };
    }

    return { width: 36, height: 36 };
  }

  const g = new dagre.graphlib.Graph({
    multigraph: true
  });

  g.setGraph({
    rankdir: 'LR',
    ranksep: 110,
    nodesep: 90,
    edgesep: 30,
    marginx: 90,
    marginy: 90,
    acyclicer: 'greedy'
  });

  g.setDefaultEdgeLabel(() => ({}));

  // Create Dagre nodes.
  for (const node of graph.nodes) {
    g.setNode(node.id, dimensions(node));
  }

  // Layout normal sequence flows.
  // Loops and jumps are routed separately.
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
    const size = dimensions(node);

    positions[node.id] = {
      x: p.x,
      y: p.y,
      width: size.width,
      height: size.height
    };
  }


  // STEP 5D.2B — Arrange BPMN elements into swimlanes.
  // Keep the original horizontal Dagre ordering.

  const assignedLanes = [
    ...new Set(
      graph.nodes.map(n => n.lane).filter(Boolean)
    )
  ];

  const laneNames = assignedLanes.length
    ? [
        ...assignedLanes,
        ...(graph.nodes.some(n => !n.lane)
          ? ['Unassigned']
          : [])
      ]
    : [];

  const laneRows = [];
  let nextLaneY = 75;

  // Leave space for the vertical pool/lane headers.
  for (const p of Object.values(positions)) {
    p.x += 85;
  }

  for (const [laneIndex, name] of laneNames.entries()) {
    const members = graph.nodes.filter(
      n => (n.lane || 'Unassigned') === name
    );

    // Nodes at similar X coordinates share a column.
    const columns = new Map();

    for (const node of members) {
      const p = positions[node.id];
      const key = Math.round(p.x / 20) * 20;

      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push(node);
    }

    const largestColumn = Math.max(
      1,
      ...[...columns.values()].map(a => a.length)
    );

    const height = Math.max(
      170,
      70 + largestColumn * 110
    );

    for (const column of columns.values()) {
      column.sort(
        (a, b) =>
          positions[a.id].y - positions[b.id].y
      );

      column.forEach((node, index) => {
        positions[node.id].y =
          nextLaneY +
          height / 2 +
          (index - (column.length - 1) / 2) * 110;
      });
    }

    laneRows.push({
      id: 'Lane_' + (laneIndex + 1),
      name,
      y: nextLaneY,
      height
    });

    nextLaneY += height;
  }


  const maxX = Math.max(
    ...Object.values(positions).map(
      p => p.x + p.width / 2
    )
  );

  const maxY = Math.max(
    ...Object.values(positions).map(
      p => p.y + p.height / 2
    )
  );


  const loopChannelX = maxX + 75;

  const poolRight = Math.max(750, maxX + 160);

  const poolBottom = laneRows.length
    ? nextLaneY + 25
    : Math.max(340, maxY + 90);


  // BPMN diagram and plane.
  const diagram = diElement(
    root, NS.bpmndi, 'bpmndi', 'BPMNDiagram',
    { id: 'BPMNDiagram_KrysBPM' }
  );

  const plane = diElement(
    diagram, NS.bpmndi, 'bpmndi', 'BPMNPlane',
    {
      id: 'BPMNPlane_KrysBPM',
      bpmnElement: 'Collaboration_KrysBPM'
    }
  );

  // Draw the process pool.
  const poolShape = diElement(
    plane, NS.bpmndi, 'bpmndi', 'BPMNShape',
    {
      id: 'Shape_Participant_KrysBPM',
      bpmnElement: 'Participant_KrysBPM',
      isHorizontal: 'true'
    }
  );

  diElement(
    poolShape, NS.dc, 'dc', 'Bounds',
    {
      x: 20,
      y: 30,
      width: poolRight - 20,
      height: poolBottom - 30
    }
  );


  // Draw BPMN lane boundaries.
  // Lane IDs match those from the semantic laneSet.

  for (const lane of laneRows) {
    const laneShape = diElement(
      plane,
      NS.bpmndi,
      'bpmndi',
      'BPMNShape',
      {
        id: 'Shape_' + lane.id,
        bpmnElement: lane.id,
        isHorizontal: 'true'
      }
    );

    diElement(
      laneShape,
      NS.dc,
      'dc',
      'Bounds',
      {
        x: 65,
        y: Math.round(lane.y),
        width: poolRight - 65,
        height: Math.round(lane.height)
      }
    );
  }


  // One BPMN shape for every graph node.
  for (const node of graph.nodes) {
    const p = positions[node.id];

    const shape = diElement(
      plane, NS.bpmndi, 'bpmndi', 'BPMNShape',
      {
        id: 'Shape_' + node.id,
        bpmnElement: node.id
      }
    );

    diElement(
      shape, NS.dc, 'dc', 'Bounds',
      {
        x: Math.round(p.x - p.width / 2),
        y: Math.round(p.y - p.height / 2),
        width: p.width,
        height: p.height
      }
    );
  }

  // One BPMN edge for every process connection.
  for (const edge of graph.edges) {
    const from = positions[edge.source];
    const to = positions[edge.target];

    if (!from || !to) {
      throw new Error(
        'Missing BPMN connector position: ' + edge.id
      );
    }

    let points = [];



    // Step 5D.2D — Separate gateway branch exits.
    const sourceNode = graph.nodes.find(
      node => node.id === edge.source
    );

    const isDecision =
      sourceNode?.kind === 'gateway' &&
      !sourceNode.merge;

    const branch = (edge.label || '').toUpperCase();

    const offset = isDecision
      ? branch === 'YES' ? -12
        : branch === 'NO' ? 12
        : 0
      : 0;

    // Offset the starting point along the diamond edge.
    const startX = isDecision && offset
      ? from.x + from.width / 2 - Math.abs(offset)
      : from.x + from.width / 2;

    const startY = from.y + offset;


    if (
      edge.kind === 'sequence' &&
      to.x - to.width / 2 > startX + 20
    ) {
      // Normal left-to-right sequence flow.
      const endX = to.x - to.width / 2;
      const endY = to.y;
      
      // Give YES and NO different vertical tracks.
      const routeFraction =
        branch === 'YES' ? 0.35 :
        branch === 'NO'  ? 0.65 :
        0.50;

      const midX =
        startX + (endX - startX) * routeFraction;


      points = [
        { x: startX, y: startY },
        { x: midX, y: startY },
        { x: midX, y: endY },
        { x: endX, y: endY }
      ];

    } else {
      // Backward flows, loops and same-column connections.
      const channelX = Math.max(
        loopChannelX,
        startX + 60,
        to.x + to.width / 2 + 60
      );

      points = [
        { x: startX, y: startY },
        { x: channelX, y: startY },
        { x: channelX, y: to.y },
        { x: to.x + to.width / 2, y: to.y }
      ];
    }


    const xmlEdge = diElement(
      plane, NS.bpmndi, 'bpmndi', 'BPMNEdge',
      {
        id: 'DI_' + edge.id,
        bpmnElement: edge.id
      }
    );

    for (const point of points) {
      diElement(
        xmlEdge, NS.di, 'di', 'waypoint',
        {
          x: Math.round(point.x),
          y: Math.round(point.y)
        }
      );
    }
  }

  return positions;
}


  // Generate semantic BPMN XML from an existing process graph.
  function exportXML(graph, options = {}) {

    if (!graph || !Array.isArray(graph.nodes) ||
        !Array.isArray(graph.edges)) {
      throw new Error('A valid KrysBPM process graph is required.');
    }

    if (!graph.nodes.length) {
      throw new Error('Cannot export an empty BPMN process.');
    }

    const processName =
      String(options.title || graph.title || 'Process');

    const executable = options.executable === true;

    // Browser-native XML document.
    const doc = document.implementation.createDocument(
      NS.bpmn,
      'bpmn:definitions',
      null
    );

    const root = doc.documentElement;

    root.setAttribute('xmlns:bpmn', NS.bpmn);
    root.setAttribute('xmlns:bpmndi', NS.bpmndi);
    root.setAttribute('xmlns:dc', NS.dc);
    root.setAttribute('xmlns:di', NS.di);

    root.setAttribute('id', 'Definitions_KrysBPM');
    root.setAttribute(
      'targetNamespace',
      'https://krysml.com/bpm'
    );

    root.setAttribute(
      'exporter',
      'KrysBPM'
    );

    root.setAttribute(
      'exporterVersion',
      BPM_EXPORT_VERSION
    );

    // Helper: create a BPMN element.
    function add(parent, name, attributes = {}) {
      const el = doc.createElementNS(
        NS.bpmn,
        'bpmn:' + name
      );

      for (const [key, value] of Object.entries(attributes)) {
        if (value !== null && value !== undefined) {
          el.setAttribute(key, String(value));
        }
      }

      parent.appendChild(el);
      return el;
    }

    const PROCESS_ID = 'Process_KrysBPM';
    const PARTICIPANT_ID = 'Participant_KrysBPM';

    // One pool represents the selected process.
    const collaboration = add(root, 'collaboration', {
      id: 'Collaboration_KrysBPM'
    });

    add(collaboration, 'participant', {
      id: PARTICIPANT_ID,
      name: processName,
      processRef: PROCESS_ID
    });

    const process = add(root, 'process', {
      id: PROCESS_ID,
      name: processName,
      isExecutable: String(executable)
    });

    // Collect lanes from @ assignments.
    // Only the first @ per step was retained by the parser.
    const laneNames = [
      ...new Set(
        graph.nodes
          .map(node => node.lane)
          .filter(Boolean)
      )
    ];

    if (laneNames.length) {

      // Unassigned elements need a lane as well.
      const hasUnassigned = graph.nodes.some(
        node => !node.lane
      );

      if (hasUnassigned) {
        laneNames.push('Unassigned');
      }

      const laneSet = add(process, 'laneSet', {
        id: 'LaneSet_KrysBPM'
      });

      laneNames.forEach((laneName, index) => {
        const lane = add(laneSet, 'lane', {
          id: 'Lane_' + (index + 1),
          name: laneName
        });

        for (const node of graph.nodes) {
          if ((node.lane || 'Unassigned') === laneName) {
            const ref = add(lane, 'flowNodeRef');
            ref.textContent = node.id;
          }
        }
      });
    }

    // Build incoming and outgoing flow indexes.
    const incoming = new Map();
    const outgoing = new Map();

    for (const edge of graph.edges) {
      if (!incoming.has(edge.target)) {
        incoming.set(edge.target, []);
      }

      if (!outgoing.has(edge.source)) {
        outgoing.set(edge.source, []);
      }

      incoming.get(edge.target).push(edge.id);
      outgoing.get(edge.source).push(edge.id);
    }

    // Create all BPMN flow nodes.
    for (const node of graph.nodes) {

      const type = nodeType(node);

      const attributes = {
        id: node.id,
        name: node.merge ? undefined : node.label
      };

      if (node.merge &&
          type.endsWith('Gateway')) {
        attributes.gatewayDirection = 'Converging';
      } else if (
        node.kind === 'gateway' &&
        type.endsWith('Gateway')
      ) {
        attributes.gatewayDirection = 'Diverging';
      }

      const element = add(process, type, attributes);

      // BPMN incoming flow references.
      for (const id of incoming.get(node.id) || []) {
        const ref = add(element, 'incoming');
        ref.textContent = id;
      }

      // BPMN outgoing flow references.
      for (const id of outgoing.get(node.id) || []) {
        const ref = add(element, 'outgoing');
        ref.textContent = id;
      }

      // Event definitions.
      if (
        node.kind === 'event' ||
        node.kind === 'start' ||
        node.kind === 'end'
      ) {
        if (node.eventType === 'timer') {

          const definition = add(
            element,
            'timerEventDefinition',
            { id: 'Timer_' + node.id }
          );

          const duration =
            window.KrysBPMParser?.durationISO(node.label);

          if (duration) {
            const timer = add(definition, 'timeDuration');
            timer.textContent = duration;
          }

        } else if (node.eventType === 'message') {

          add(element, 'messageEventDefinition', {
            id: 'Message_' + node.id
          });

        } else if (node.eventType === 'error') {

          add(element, 'errorEventDefinition', {
            id: 'Error_' + node.id
          });
        }
      }
    }

    // Create all sequence flows.
    // Loops and jumps are BPMN sequence flows too.
    for (const edge of graph.edges) {
      add(process, 'sequenceFlow', {
        id: edge.id,
        sourceRef: edge.source,
        targetRef: edge.target,
        name: edge.label || undefined
      });
    }

      // Generate BPMN diagram shapes and connector positions.
      buildDiagram(graph, doc, root);

    const xml = new XMLSerializer()
      .serializeToString(doc);

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      xml
    );
  }

  window.KrysBPMExport = {
    version: BPM_EXPORT_VERSION,
    exportXML,
    nodeType
  };

  console.log(
    'KrysBPM exporter ' +
    BPM_EXPORT_VERSION +
    ' loaded'
  );
})();
