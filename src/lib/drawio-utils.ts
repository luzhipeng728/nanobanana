// Draw.io XML 处理工具函数
// 从 next-ai-draw-io 项目复刻

import * as pako from 'pako';

/**
 * Format XML string with proper indentation and line breaks
 */
export function formatXML(xml: string, indent: string = '  '): string {
  let formatted = '';
  let pad = 0;

  // Remove existing whitespace between tags
  xml = xml.replace(/>\s*</g, '><').trim();

  // Split on tags
  const tags = xml.split(/(?=<)|(?<=>)/g).filter(Boolean);

  tags.forEach((node, index) => {
    if (node.match(/^<\/\w/)) {
      // Closing tag - decrease indent
      pad = Math.max(0, pad - 1);
      formatted += indent.repeat(pad) + node + '\n';
    } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
      // Opening tag
      formatted += indent.repeat(pad) + node;
      // Only add newline if next item is a tag
      const nextIndex = index + 1;
      if (nextIndex < tags.length && tags[nextIndex].startsWith('<')) {
        formatted += '\n';
        if (!node.match(/^<\w[^>]*\/>$/)) {
          pad++;
        }
      }
    } else if (node.match(/^<\w[^>]*\/>$/)) {
      // Self-closing tag
      formatted += indent.repeat(pad) + node + '\n';
    } else if (node.startsWith('<')) {
      // Other tags (like <?xml)
      formatted += indent.repeat(pad) + node + '\n';
    } else {
      // Text content
      formatted += node;
    }
  });

  return formatted.trim();
}

/**
 * Efficiently converts a potentially incomplete XML string to a legal XML string
 */
export function convertToLegalXml(xmlString: string): string {
  const regex = /<mxCell\b[^>]*(?:\/>|>([\s\S]*?)<\/mxCell>)/g;
  let match: RegExpExecArray | null;
  let result = "<root>\n";

  while ((match = regex.exec(xmlString)) !== null) {
    const formatted = match[0].split('\n').map(line => "    " + line.trim()).join('\n');
    result += formatted + "\n";
  }
  result += "</root>";

  return result;
}

/**
 * Replace nodes in a Draw.io XML diagram
 */
export function replaceNodes(currentXML: string, nodes: string): string {
  if (!currentXML || !nodes) {
    throw new Error("Both currentXML and nodes must be provided");
  }

  try {
    const parser = new DOMParser();
    const currentDoc = parser.parseFromString(currentXML, "text/xml");

    let nodesString = nodes;
    if (!nodes.includes("<root>")) {
      nodesString = `<root>${nodes}</root>`;
    }

    const nodesDoc = parser.parseFromString(nodesString, "text/xml");

    let currentRoot = currentDoc.querySelector("mxGraphModel > root");
    if (!currentRoot) {
      const mxGraphModel = currentDoc.querySelector("mxGraphModel") ||
        currentDoc.createElement("mxGraphModel");

      if (!currentDoc.contains(mxGraphModel)) {
        currentDoc.appendChild(mxGraphModel);
      }

      currentRoot = currentDoc.createElement("root");
      mxGraphModel.appendChild(currentRoot);
    }

    const nodesRoot = nodesDoc.querySelector("root");
    if (!nodesRoot) {
      throw new Error("Invalid nodes: Could not find or create <root> element");
    }

    while (currentRoot.firstChild) {
      currentRoot.removeChild(currentRoot.firstChild);
    }

    const hasCell0 = Array.from(nodesRoot.childNodes).some(
      node => node.nodeName === "mxCell" &&
        (node as Element).getAttribute("id") === "0"
    );

    const hasCell1 = Array.from(nodesRoot.childNodes).some(
      node => node.nodeName === "mxCell" &&
        (node as Element).getAttribute("id") === "1"
    );

    Array.from(nodesRoot.childNodes).forEach(node => {
      const importedNode = currentDoc.importNode(node, true);
      currentRoot.appendChild(importedNode);
    });

    if (!hasCell0) {
      const cell0 = currentDoc.createElement("mxCell");
      cell0.setAttribute("id", "0");
      currentRoot.insertBefore(cell0, currentRoot.firstChild);
    }

    if (!hasCell1) {
      const cell1 = currentDoc.createElement("mxCell");
      cell1.setAttribute("id", "1");
      cell1.setAttribute("parent", "0");

      const cell0 = currentRoot.querySelector('mxCell[id="0"]');
      if (cell0 && cell0.nextSibling) {
        currentRoot.insertBefore(cell1, cell0.nextSibling);
      } else {
        currentRoot.appendChild(cell1);
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(currentDoc);
  } catch (error) {
    throw new Error(`Error replacing nodes: ${error}`);
  }
}

/**
 * Replace specific parts of XML content using search and replace pairs
 */
export function replaceXMLParts(
  xmlContent: string,
  searchReplacePairs: Array<{ search: string; replace: string }>
): string {
  let result = formatXML(xmlContent);
  let lastProcessedIndex = 0;

  for (const { search, replace } of searchReplacePairs) {
    const formattedSearch = formatXML(search);
    const searchLines = formattedSearch.split('\n');
    const resultLines = result.split('\n');

    if (searchLines[searchLines.length - 1] === '') {
      searchLines.pop();
    }

    let startLineNum = 0;
    let currentIndex = 0;
    while (currentIndex < lastProcessedIndex && startLineNum < resultLines.length) {
      currentIndex += resultLines[startLineNum].length + 1;
      startLineNum++;
    }

    let matchFound = false;
    let matchStartLine = -1;
    let matchEndLine = -1;

    // First try: exact match
    for (let i = startLineNum; i <= resultLines.length - searchLines.length; i++) {
      let matches = true;

      for (let j = 0; j < searchLines.length; j++) {
        if (resultLines[i + j] !== searchLines[j]) {
          matches = false;
          break;
        }
      }

      if (matches) {
        matchStartLine = i;
        matchEndLine = i + searchLines.length;
        matchFound = true;
        break;
      }
    }

    // Second try: line-trimmed match
    if (!matchFound) {
      for (let i = startLineNum; i <= resultLines.length - searchLines.length; i++) {
        let matches = true;

        for (let j = 0; j < searchLines.length; j++) {
          const originalTrimmed = resultLines[i + j].trim();
          const searchTrimmed = searchLines[j].trim();

          if (originalTrimmed !== searchTrimmed) {
            matches = false;
            break;
          }
        }

        if (matches) {
          matchStartLine = i;
          matchEndLine = i + searchLines.length;
          matchFound = true;
          break;
        }
      }
    }

    // Third try: substring match
    if (!matchFound) {
      const searchStr = search.trim();
      const resultStr = result;
      const index = resultStr.indexOf(searchStr);

      if (index !== -1) {
        result = resultStr.substring(0, index) + replace.trim() + resultStr.substring(index + searchStr.length);
        result = formatXML(result);
        continue;
      }
    }

    if (!matchFound) {
      throw new Error(`Search pattern not found in the diagram.`);
    }

    const replaceLines = replace.split('\n');
    if (replaceLines[replaceLines.length - 1] === '') {
      replaceLines.pop();
    }

    const newResultLines = [
      ...resultLines.slice(0, matchStartLine),
      ...replaceLines,
      ...resultLines.slice(matchEndLine)
    ];

    result = newResultLines.join('\n');

    lastProcessedIndex = 0;
    for (let i = 0; i < matchStartLine + replaceLines.length; i++) {
      lastProcessedIndex += newResultLines[i].length + 1;
    }
  }

  return result;
}

/**
 * Validates draw.io XML structure for common issues
 */
export function validateMxCellStructure(xml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return `Invalid XML: syntax errors. Please escape special characters: &lt; for <, &gt; for >, &amp; for &.`;
  }

  const allCells = doc.querySelectorAll('mxCell');

  const cellIds = new Set<string>();
  const duplicateIds: string[] = [];
  const nestedCells: string[] = [];
  const orphanCells: string[] = [];
  const invalidParents: { id: string; parent: string }[] = [];
  const edgesToValidate: { id: string; source: string | null; target: string | null }[] = [];

  allCells.forEach(cell => {
    const id = cell.getAttribute('id');
    const parent = cell.getAttribute('parent');
    const isEdge = cell.getAttribute('edge') === '1';

    if (id) {
      if (cellIds.has(id)) {
        duplicateIds.push(id);
      } else {
        cellIds.add(id);
      }
    }

    if (cell.parentElement?.tagName === 'mxCell') {
      nestedCells.push(id || 'unknown');
    }

    if (id !== '0') {
      if (!parent) {
        if (id) orphanCells.push(id);
      } else {
        invalidParents.push({ id: id || 'unknown', parent });
      }
    }

    if (isEdge) {
      edgesToValidate.push({
        id: id || 'unknown',
        source: cell.getAttribute('source'),
        target: cell.getAttribute('target')
      });
    }
  });

  if (nestedCells.length > 0) {
    return `Invalid XML: Found nested mxCell elements (IDs: ${nestedCells.slice(0, 3).join(', ')}). All mxCell must be direct children of <root>.`;
  }

  if (duplicateIds.length > 0) {
    return `Invalid XML: Found duplicate cell IDs (${duplicateIds.slice(0, 3).join(', ')}).`;
  }

  if (orphanCells.length > 0) {
    return `Invalid XML: Found cells without parent attribute (IDs: ${orphanCells.slice(0, 3).join(', ')}).`;
  }

  const badParents = invalidParents.filter(p => !cellIds.has(p.parent));
  if (badParents.length > 0) {
    const details = badParents.slice(0, 3).map(p => `${p.id} (parent: ${p.parent})`).join(', ');
    return `Invalid XML: Found cells with invalid parent references (${details}).`;
  }

  const invalidConnections: string[] = [];
  edgesToValidate.forEach(edge => {
    if (edge.source && !cellIds.has(edge.source)) {
      invalidConnections.push(`${edge.id} (source: ${edge.source})`);
    }
    if (edge.target && !cellIds.has(edge.target)) {
      invalidConnections.push(`${edge.id} (target: ${edge.target})`);
    }
  });

  if (invalidConnections.length > 0) {
    return `Invalid XML: Found edges with invalid source/target references (${invalidConnections.slice(0, 3).join(', ')}).`;
  }

  return null;
}

/**
 * Extract diagram XML from SVG string
 */
export function extractDiagramXML(xml_svg_string: string): string {
  try {
    const svgString = atob(xml_svg_string.slice(26));
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
    const svgElement = svgDoc.querySelector('svg');

    if (!svgElement) {
      throw new Error("No SVG element found in the input string.");
    }

    const encodedContent = svgElement.getAttribute('content');

    if (!encodedContent) {
      throw new Error("SVG element does not have a 'content' attribute.");
    }

    function decodeHtmlEntities(str: string) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = str;
      return textarea.value;
    }
    const xmlContent = decodeHtmlEntities(encodedContent);

    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    const diagramElement = xmlDoc.querySelector('diagram');

    if (!diagramElement) {
      throw new Error("No diagram element found");
    }

    const base64EncodedData = diagramElement.textContent;

    if (!base64EncodedData) {
      throw new Error("No encoded data found in the diagram element");
    }

    const binaryString = atob(base64EncodedData);

    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decompressedData = pako.inflate(bytes, { windowBits: -15 });

    const decoder = new TextDecoder('utf-8');
    const decodedString = decoder.decode(decompressedData);

    const urlDecodedString = decodeURIComponent(decodedString);

    return urlDecodedString;

  } catch (error) {
    console.error("Error extracting diagram XML:", error);
    throw error;
  }
}

/**
 * Check if diagram is minimal/empty
 */
export function isMinimalDiagram(xml: string): boolean {
  const stripped = xml.replace(/\s/g, '');
  return !stripped.includes('id="2"');
}

/**
 * Get empty diagram XML
 */
export function getEmptyDiagramXML(): string {
  return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
}
