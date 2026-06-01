// src/workers/detectors/apiInComponent.ts
import { Issue, ParsedFile, walk, findAll, lineOf, endLineOf } from '../../lib/analyze';

interface ApiCall {
  url: string;
  node: any;
  line: number;
  endLine: number;
}

export function detectApiInComponent(pf: ParsedFile): Issue[] {
  const issues: Issue[] = [];

  walk(pf.ast, {
    FunctionDeclaration(node: any) {
      if (node.id && /^[A-Z]/.test(node.id.name)) {
        analyzeComponent(node, node.id.name);
      }
    },
    VariableDeclarator(node: any) {
      if (
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' || node.init.type === 'FunctionExpression') &&
        node.id.type === 'Identifier' &&
        /^[A-Z]/.test(node.id.name)
      ) {
        analyzeComponent(node.init, node.id.name);
      }
    },
  });

  function getBaseDomain(url: string): string {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const urlObj = new URL(url);
        return urlObj.hostname;
      }
    } catch {
      // Parse error
    }
    const match = url.match(/^\/api\/([^\/]+)/);
    if (match) return `/api/${match[1]}`;
    return 'local-api';
  }

  function analyzeComponent(compNode: any, compName: string) {
    const apiCalls: ApiCall[] = [];

    // Find all fetch/axios call expressions inside this component
    walk(compNode, {
      CallExpression(node: any) {
        let isApi = false;
        let urlArg = '';

        if (node.callee.type === 'Identifier') {
          if (node.callee.name === 'fetch' || node.callee.name === 'axios') {
            isApi = true;
          }
        } else if (node.callee.type === 'MemberExpression') {
          const obj = node.callee.object;
          const prop = node.callee.property;
          if (
            obj.type === 'Identifier' &&
            obj.name === 'axios' &&
            prop.type === 'Identifier' &&
            ['get', 'post', 'put', 'delete', 'patch'].includes(prop.name)
          ) {
            isApi = true;
          }
        }

        if (isApi && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
            urlArg = firstArg.value;
          } else if (firstArg.type === 'TemplateLiteral') {
            urlArg = firstArg.quasis.map((q: any) => q.value.raw).join('${var}');
          } else {
            urlArg = 'dynamic-url';
          }
          apiCalls.push({
            url: urlArg,
            node,
            line: lineOf(node),
            endLine: endLineOf(node),
          });
        }
      },
      // Do not enter nested components
      FunctionDeclaration(_node, skip) { skip?.() },
      FunctionExpression(_node, skip) { skip?.() },
      ArrowFunctionExpression(_node, skip) { skip?.() },
    });

    if (apiCalls.length === 0) return;

    // Group api calls by domain
    const groups = new Map<string, ApiCall[]>();
    for (const call of apiCalls) {
      const domain = getBaseDomain(call.url);
      const list = groups.get(domain) ?? [];
      list.push(call);
      groups.set(domain, list);
    }

    // Report for each domain group
    for (const [domain, calls] of groups.entries()) {
      const firstCall = calls[0];

      // Find the parent statement that contains the firstCall node
      let enclosingNode = firstCall.node as any;
      while (enclosingNode && enclosingNode.parent && enclosingNode.parent.type !== 'BlockStatement' && enclosingNode.parent.type !== 'Program') {
        enclosingNode = enclosingNode.parent;
      }
      // If we are inside a useEffect call, let's step up to the useEffect CallExpression
      let temp = firstCall.node as any;
      while (temp && temp.parent) {
        if (temp.type === 'CallExpression' && temp.callee.type === 'Identifier' && temp.callee.name === 'useEffect') {
          enclosingNode = temp;
          break;
        }
        temp = temp.parent;
      }

      const startLine = lineOf(enclosingNode);
      const endLine = endLineOf(enclosingNode);
      const beforeLines = pf.lines.slice(startLine - 1, endLine);

      issues.push({
        id: `api-in-component-${pf.filePath}-${startLine}-${domain}`,
        file: pf.fileName,
        filePath: pf.filePath,
        category: 'api-in-component',
        problem: `Chamada direta à API detetada em \`${compName}\` (domínio: \`${domain}\`). Extrai chamadas fetch/axios para serviços ou custom hooks`,
        impact: 'High',
        lineStart: startLine,
        lineEnd: endLine,
        lines: { before: beforeLines, after: [] },
      });
    }
  }

  return issues;
}
