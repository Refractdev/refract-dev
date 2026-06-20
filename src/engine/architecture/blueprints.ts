import type { ArchitectureBlueprint, ArchitectureProfile, BlueprintId } from '../types'

/**
 * Enterprise architecture blueprints expressed as pure data. Each one defines
 * the target folder layers, the dependency rules between them, and hints used
 * to place existing files. The planner LLM is constrained to these.
 */
export const BLUEPRINTS: Record<BlueprintId, ArchitectureBlueprint> = {
  'clean-layered': {
    id: 'clean-layered',
    name: 'Clean Layered',
    summary:
      'Separação por camadas: domain (regras puras), application (casos de uso), infrastructure (IO/serviços) e presentation (UI). Dependências só apontam para dentro.',
    root: 'src',
    layers: [
      { id: 'domain', description: 'Entidades, tipos e regras de negócio puras (sem IO).', canImportFrom: [] },
      { id: 'application', description: 'Casos de uso e orquestração.', canImportFrom: ['domain'] },
      {
        id: 'infrastructure',
        description: 'Acesso a APIs, base de dados, storage e serviços externos.',
        canImportFrom: ['domain', 'application'],
      },
      {
        id: 'presentation',
        description: 'Componentes React, páginas, hooks e estado de UI.',
        canImportFrom: ['domain', 'application', 'infrastructure'],
      },
    ],
    placementHints: [
      { match: 'components', layer: 'presentation' },
      { match: 'pages', layer: 'presentation' },
      { match: 'hooks', layer: 'presentation' },
      { match: 'context', layer: 'presentation' },
      { match: 'store', layer: 'application' },
      { match: 'services', layer: 'infrastructure' },
      { match: 'api', layer: 'infrastructure' },
      { match: 'lib', layer: 'infrastructure' },
      { match: 'utils', layer: 'domain' },
      { match: 'types', layer: 'domain' },
      { match: 'models', layer: 'domain' },
    ],
    recommendedFor: ['flat', 'technical', 'mixed'],
  },
  'feature-based': {
    id: 'feature-based',
    name: 'Feature-Based',
    summary:
      'Agrupa o código por funcionalidade (features/<nome>) com componentes, hooks e serviços co-localizados. Partilhado vai para shared/.',
    root: 'src',
    layers: [
      { id: 'features', description: 'Cada feature isolada com a sua UI, lógica e dados.', canImportFrom: ['shared'] },
      { id: 'shared', description: 'Código reutilizável entre features (ui, utils, tipos).', canImportFrom: [] },
      { id: 'app', description: 'Composição da aplicação, rotas e providers.', canImportFrom: ['features', 'shared'] },
    ],
    placementHints: [
      { match: 'components', layer: 'shared' },
      { match: 'hooks', layer: 'shared' },
      { match: 'utils', layer: 'shared' },
      { match: 'lib', layer: 'shared' },
      { match: 'types', layer: 'shared' },
      { match: 'pages', layer: 'features' },
      { match: 'services', layer: 'features' },
      { match: 'context', layer: 'app' },
      { match: 'store', layer: 'app' },
    ],
    recommendedFor: ['feature', 'technical', 'mixed'],
  },
  'modular-monolith': {
    id: 'modular-monolith',
    name: 'Modular Monolith',
    summary:
      'Módulos independentes (modules/<nome>) com fronteiras explícitas via barrels (index.ts). Core partilhado para infra transversal.',
    root: 'src',
    layers: [
      { id: 'modules', description: 'Módulos de negócio com API pública via index.ts.', canImportFrom: ['core'] },
      { id: 'core', description: 'Infra transversal: config, clientes, utils partilhados.', canImportFrom: [] },
      { id: 'app', description: 'Bootstrap, rotas e wiring dos módulos.', canImportFrom: ['modules', 'core'] },
    ],
    placementHints: [
      { match: 'components', layer: 'modules' },
      { match: 'pages', layer: 'modules' },
      { match: 'services', layer: 'modules' },
      { match: 'hooks', layer: 'modules' },
      { match: 'lib', layer: 'core' },
      { match: 'utils', layer: 'core' },
      { match: 'api', layer: 'core' },
      { match: 'types', layer: 'core' },
      { match: 'context', layer: 'app' },
      { match: 'store', layer: 'app' },
    ],
    recommendedFor: ['feature', 'layered', 'mixed'],
  },
}

export function getBlueprint(id: BlueprintId): ArchitectureBlueprint {
  return BLUEPRINTS[id]
}

export function listBlueprints(): ArchitectureBlueprint[] {
  return Object.values(BLUEPRINTS)
}

/**
 * Picks the best-fit blueprint for a detected profile. Deterministic: prefers a
 * blueprint that lists the current structure kind in `recommendedFor`, with a
 * sensible default per structure kind.
 */
export function recommendBlueprint(profile: ArchitectureProfile): BlueprintId {
  const kind = profile.structure.kind

  // A flat or technical-split project benefits most from clear layering.
  if (kind === 'flat' || kind === 'technical') return 'clean-layered'
  // Already feature-ish -> reinforce feature boundaries.
  if (kind === 'feature') return 'feature-based'
  // Already layered -> modular monolith adds explicit module boundaries.
  if (kind === 'layered') return 'modular-monolith'

  // mixed / fallback: choose the first blueprint that recommends this kind.
  const match = listBlueprints().find((bp) => bp.recommendedFor.includes(kind))
  return match?.id ?? 'clean-layered'
}
