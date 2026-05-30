# Entendimento Detalhado do Plano Refract 10x
**Documento de Análise e Arquitetura de Implementação**

Este documento detalha o entendimento aprofundado do plano estratégico [REFACT_10X_PLAN.md](file:///Users/lopes/Desktop/refract/docs/REFACT_10X_PLAN.md) e mapeia os requisitos avançados de engenharia necessários para a sua implementação correta. O objetivo é evitar abordagens simplistas ou "wrappers básicos de IA", focando na criação de sistemas de engenharia robustos, seguros e autónomos.

---

## 1. Drift Monitor (Vigilância Contínua Real)

Este pilar exige um sistema real de monitoramento de saúde de código (comparável a um APM de qualidade arquitetural como Datadog/Sentry). Não é um painel visual estático ou mockado.

### O que o sistema faz na prática:
* **Integração Nativa GitHub App:** Através de webhooks reais, o sistema monitora eventos de `push` e `pull_request` no repositório do utilizador.
* **Pipeline de Análise e Execução:** Sempre que novos commits chegam, um runner em background analisa as alterações em tempo real.
* **Detecção de Código Decay (Drift):** Analisa a variação da qualidade de código entre revisões para identificar regressões, desvios da arquitetura padrão, anomalias (ex: inserção em lote de `any` no TypeScript) ou trechos de código suspeitos.
* **Armazenamento e Métricas Reais:** Salva dados estatísticos históricos das execuções em banco de dados persistente.
* **Painel de Tendências Visual:** Apresenta gráficos reais (ex: gráficos de linhas/áreas de evolução de débitos técnicos e métricas arquiteturais), permitindo que equipas de engenharia vejam o momento exato em que a qualidade começou a decair.

---

## 2. Safety Guarantee (Gate de Segurança Integrado)

Antes de qualquer sugestão ou refatoração ser apresentada ao utilizador final como "segura", ela precisa passar por um pipeline de validação estrito que comprove a integridade do código.

### Fluxo de Validação do Gate:
1. **Validação Sintática (Syntax Check):** Executa o parse do código resultante para assegurar que a sintaxe JS/TS/JSX é válida.
2. **Checagem de Tipos (Type Safety):** Executa a compilação do TypeScript (ex: `tsc --noEmit` de forma incremental nos arquivos modificados e seus dependentes) garantindo que nenhum erro de tipagem foi introduzido.
3. **Integridade de Build (Build Validation):** Assegura que o projeto como um todo consegue realizar o build sem falhas catastróficas.
4. **Validação de Testes Unitários:** Executa a suite de testes relacionados aos módulos alterados para assegurar que não houve quebra de regras de negócios existentes.

> [!IMPORTANT]
> Se qualquer etapa deste pipeline falhar, o patch é bloqueado, reavaliado e, se possível, reduzido a uma versão mais conservadora (ex: mantendo assinaturas externas e aplicando a refatoração apenas de forma interna) antes de ser apresentado.

---

## 3. Specialized Refactoring Engine (Motor de Refatoração Determinístico)

A IA não realiza o refactoring diretamente. Em vez de depender do comportamento probabilístico e instável de um LLM para gerar o código final, a IA é usada como a mente analítica (compreender contexto, gerar documentação, resumir riscos e tradeoffs). O motor de escrita é **determinístico**.

### Divisão de Responsabilidade:
* **AI Engine:**
  - Compreensão semântica do repositório.
  - Explicação do problema estrutural e propostas de solução.
  - Documentação automática e detalhamento de riscos/tradeoffs.
* **Refactoring Engine (Determinístico):**
  - Implementação via AST (Abstract Syntax Tree) usando ferramentas robustas (como `ts-morph` ou `jscodeshift`).
  - Execução estruturada de tarefas pesadas de engenharia:
    - **Decomposição de Componentes:** Particionar dinamicamente arquivos React gigantes em múltiplos sub-componentes menores e isolados.
    - **Consolidação de Estado:** Identificar estados duplicados/redundantes e unificá-los de forma automatizada.
    - **Reestruturação Física:** Mover e reorganizar módulos, arquivos e pastas.
    - **Limpeza de Dependências:** Eliminar imports mortos, resolver dependências circulares e otimizar acoplamento.
    - **Centralização de APIs:** Localizar requisições dispersas e migrar para uma estrutura centralizada.

---

## 4. CodeMap Avançado (Mapa Arquitetural Interativo)

O CodeMap deve ser uma ferramenta ativa de tomada de decisão arquitetônica e visualização de fluxo, não apenas um diagrama decorativo.

### Características do CodeMap:
* **Mapeamento de Dependências:** Análise física das diretivas de importação para construir um Grafo Direcionado Acíclico (DAG) das conexões do projeto.
* **Painel Interativo de Riscos:** Exibição visual de arquivos com maior densidade de problemas ou alta complexidade de manutenção.
* **Simulação de Impacto (Blast Radius):** Ao inspecionar um arquivo no mapa, o sistema calcula e destaca visualmente todos os caminhos que seriam impactados caso o arquivo fosse refatorado, permitindo planejar a migração com segurança.
* **Integração com Workspace:** Navegar, inspecionar problemas e aceitar refatorações diretamente a partir das conexões do mapa.

---

## 5. Diferenciadores Estratégicos (10x Better)

### Impact Radar & Blast Radius
Apresenta relatórios analíticos antes do commit ser feito:
* Lista exata de arquivos que sofrerão alteração direta e indireta.
* Identificação de componentes que dependem do código alterado.
* Índice de risco de testes e estimativa de quebra de contrato de API.

### Proof-of-Safety Bundle
Fornece aos desenvolvedores a comprovação física da segurança da alteração (logs de compilador bem-sucedidos, testes que passaram, logs de build). Se a alteração for de interface visual, inclui metadados de validação visual.

### Repo Memory & Policy Engine
Uma camada de persistência que aprende as regras de cada base de código. O Refract memoriza fronteiras arquiteturais customizadas pelo time, padrões de nomenclatura e regras internas específicas, garantindo que as futuras propostas de análise sigam rigorosamente a cultura de engenharia do repositório do cliente.

---

## 6. Modelo de Negócio e Tiers de Empacotamento

* **Free Plan (Lite):** Permite um único repositório estático com análise sob demanda (manual), aceitação e rejeição de issues individuais, histórico local e exportação simples de changelog.
* **Pro Plan (Developer):** Desbloqueia o Safety Gate, a Engine avançada de Refatoração (AST), limites de repositórios maiores e histórico completo de análise.
* **Teams Plan (Continuous Quality):** Desbloqueia o Drift Monitor (via integração GitHub App), alertas automatizados de decaimento de código, definição de políticas arquiteturais compartilhadas e relatórios recorrentes para a liderança técnica.
