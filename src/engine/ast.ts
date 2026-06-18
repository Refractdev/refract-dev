import { AST_NODE_TYPES, parse, simpleTraverse, type TSESTree } from '@typescript-eslint/typescript-estree'

export type NodeWithParent = TSESTree.Node & { parent?: NodeWithParent | null }
export type ProgramWithParent = TSESTree.Program & { parent?: NodeWithParent | null }

const PARSER_OPTIONS = {
  jsx: true,
  loc: true,
  range: true,
  comment: true,
}

export function parseSource(source: string, filePath = 'file.tsx'): ProgramWithParent {
  return withParents(parse(source, { ...PARSER_OPTIONS, filePath }) as ProgramWithParent)
}

export function tryParseSource(source: string, filePath = 'file.tsx'): { ast: ProgramWithParent | null; error: string | null } {
  try {
    return { ast: parseSource(source, filePath), error: null }
  } catch (error) {
    return { ast: null, error: error instanceof Error ? error.message : 'Unknown parse error' }
  }
}

export function withParents<T extends NodeWithParent>(ast: T): T {
  simpleTraverse(ast, { enter() {} }, true)
  return ast
}

export function getNodeText(source: string, node: TSESTree.Node): string {
  return source.slice(node.range[0], node.range[1])
}

export function lineSpan(node: TSESTree.Node): number {
  return (node.loc?.end.line ?? 0) - (node.loc?.start.line ?? 0) + 1
}

export function applyReplacements(
  source: string,
  replacements: Array<{ start: number; end: number; text: string }>,
): string {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce((output, patch) => `${output.slice(0, patch.start)}${patch.text}${output.slice(patch.end)}`, source)
}

export function isTsLikeFile(filePath: string): boolean {
  return /\.(tsx?|jsx?)$/.test(filePath)
}

export function isTsxFile(filePath: string): boolean {
  return /\.(tsx|jsx)$/.test(filePath)
}

export function returnsJsx(node: TSESTree.Node): boolean {
  let found = false
  simpleTraverse(node, {
    enter(child) {
      if (
        child.type === AST_NODE_TYPES.JSXElement ||
        child.type === AST_NODE_TYPES.JSXFragment
      ) {
        found = true
      }
    },
  })
  return found
}

export function isUseStateCall(node: TSESTree.Node | null | undefined): node is TSESTree.CallExpression {
  if (!node) return false
  if (node.type !== AST_NODE_TYPES.CallExpression) return false
  if (node.callee.type === AST_NODE_TYPES.Identifier) return node.callee.name === 'useState'
  if (node.callee.type === AST_NODE_TYPES.TSInstantiationExpression && node.callee.expression.type === AST_NODE_TYPES.Identifier) {
    return node.callee.expression.name === 'useState'
  }
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'React' &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'useState'
  )
}

export function collectDeclaredNames(node: TSESTree.Node): Set<string> {
  const declared = new Set<string>()
  simpleTraverse(node, {
    enter(child, parent) {
      if (
        child.type === AST_NODE_TYPES.Identifier &&
        parent &&
        (
          (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id === child) ||
          ((parent.type === AST_NODE_TYPES.FunctionDeclaration || parent.type === AST_NODE_TYPES.FunctionExpression) && parent.id === child) ||
          (parent.type === AST_NODE_TYPES.ClassDeclaration && parent.id === child) ||
          (parent.type === AST_NODE_TYPES.ImportDefaultSpecifier && parent.local === child) ||
          (parent.type === AST_NODE_TYPES.ImportSpecifier && parent.local === child) ||
          (parent.type === AST_NODE_TYPES.ImportNamespaceSpecifier && parent.local === child) ||
          (parent.type === AST_NODE_TYPES.RestElement && parent.argument === child) ||
          (parent.type === AST_NODE_TYPES.CatchClause && parent.param === child)
        )
      ) {
        declared.add(child.name)
      }

      if (
        (child.type === AST_NODE_TYPES.FunctionDeclaration ||
          child.type === AST_NODE_TYPES.FunctionExpression ||
          child.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
        child !== node
      ) {
        child.params.forEach((param) => addPatternNames(param, declared))
      }

      if (child.type === AST_NODE_TYPES.VariableDeclarator) {
        addPatternNames(child.id, declared)
      }
    },
  })
  return declared
}

export function collectUsedIdentifiers(node: TSESTree.Node): Set<string> {
  const used = new Set<string>()
  simpleTraverse(node, {
    enter(child, parent) {
      if (child.type !== AST_NODE_TYPES.Identifier) return
      if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.property === child && !parent.computed) return
      if (parent?.type === AST_NODE_TYPES.Property && parent.key === child && !parent.computed && !parent.shorthand) return
      if (parent?.type === AST_NODE_TYPES.PropertyDefinition && parent.key === child && !parent.computed) return
      if (parent?.type === AST_NODE_TYPES.LabeledStatement) return
      if (parent?.type === AST_NODE_TYPES.BreakStatement || parent?.type === AST_NODE_TYPES.ContinueStatement) return
      if (parent?.type?.startsWith('Import')) return
      used.add(child.name)
    },
  })
  return used
}

function addPatternNames(pattern: TSESTree.Node, bucket: Set<string>) {
  if (pattern.type === AST_NODE_TYPES.Identifier) {
    bucket.add(pattern.name)
    return
  }

  if (pattern.type === AST_NODE_TYPES.ObjectPattern) {
    pattern.properties.forEach((property) => {
      if (property.type === AST_NODE_TYPES.Property) addPatternNames(property.value, bucket)
      if (property.type === AST_NODE_TYPES.RestElement) addPatternNames(property.argument, bucket)
    })
  }

  if (pattern.type === AST_NODE_TYPES.ArrayPattern) {
    pattern.elements.forEach((element) => {
      if (element) addPatternNames(element, bucket)
    })
  }

  if (pattern.type === AST_NODE_TYPES.AssignmentPattern) {
    addPatternNames(pattern.left, bucket)
  }

  if (pattern.type === AST_NODE_TYPES.RestElement) {
    addPatternNames(pattern.argument, bucket)
  }
}
