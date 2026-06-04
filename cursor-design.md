# cursor.com — Design Reference

> Análise completa do design system, visual language e estrutura da landing page do Cursor.

---

## 1. Identidade Visual

### Marca
- **Nome**: Cursor (produto) / Anysphere, Inc. (empresa)
- **Tagline**: *"Built to make you extraordinarily productive, Cursor is the best coding agent."*
- **Posicionamento**: Applied research team. Tom técnico, confiante, quase arrogante na medida certa. Não é um produto casual — é para engenheiros sérios.

### Logo
- Wordmark simples: "Cursor" em fonte sem serifa, peso médio
- Sem ícone standalone aparente na nav — o nome sozinho carrega a marca
- Favicon: ícone quadrado com símbolo de cursor estilizado

---

## 2. Paleta de Cores

### Base
| Token         | Valor       | Uso                                      |
|---------------|-------------|------------------------------------------|
| `--bg-base`   | `#14120b`   | Background global (quase preto com leve warm) |
| `--bg-surface`| `#1a1814`   | Cards, painéis, superfícies elevadas     |
| `--bg-subtle` | `#201e18`   | Hover states, separadores suaves         |

> O tema-color do meta tag é `#14120b` — confirmando o dark como identidade absoluta do site.

### Texto
| Token          | Valor         | Uso                        |
|----------------|---------------|----------------------------|
| `--text-primary` | `#f5f0e8`   | Headings, body principal   |
| `--text-secondary`| `#9e9a8e`  | Labels, subtítulos, meta   |
| `--text-muted`  | `#5a5650`    | Placeholders, disabled     |

> A paleta de texto usa off-whites quentes, não branco puro — mantém consistência com o fundo warm-dark.

### Acento / Interativo
| Token         | Valor       | Uso                                    |
|---------------|-------------|----------------------------------------|
| `--accent`    | `#e8e0cc`   | CTAs primários, links ativos           |
| `--accent-dim`| `#c8bfa8`   | Hover de links, bordas interativas     |
| `--green`     | `#4caf7d`   | Status "Published", indicadores live   |
| `--blue-subtle`| `#3a4a6b`  | Highlights de código, tokens sintáticos|

### Filosofia de Cor
Cursor não usa azuis vibrantes, verdes néon ou gradientes agressivos. A paleta é **quase monocromática warm-dark** com micro-contrastes. Comunica seriedade técnica e foco. Nenhuma cor grita — tudo co-existe em tensão silenciosa.

---

## 3. Tipografia

### Fontes
| Role         | Família                   | Notas                                  |
|--------------|---------------------------|----------------------------------------|
| Display/Hero | Serif editorial (provavelmente custom ou licenciada) | Headings grandes com tracking tight    |
| UI / Body    | Sans-serif geométrica, peso variável | Labels, nav, corpo de texto           |
| Code         | Monospace (JetBrains Mono ou similar) | Demos de código, comandos CLI          |

### Escala Tipográfica (estimada)
| Level   | Tamanho     | Peso    | Uso                         |
|---------|-------------|---------|-----------------------------|
| Hero    | 56–72px     | 500–600 | Headline principal da hero  |
| H2      | 36–44px     | 500     | Section headings            |
| H3      | 24–28px     | 500     | Feature titles              |
| Body    | 16–18px     | 400     | Parágrafos, descrições      |
| Small   | 13–14px     | 400     | Meta info, labels           |
| Code    | 13–14px     | 400     | Snippets, terminal output   |

### Características
- Letter-spacing levemente negativo nos headings grandes (`-0.02em`)
- Line-height generoso no corpo (`1.6–1.7`)
- Sem `text-transform: uppercase` agressivo — preferem casing natural
- Quotes de testimonials usam italic + peso aumentado para contraste

---

## 4. Layout & Grid

### Estrutura Geral
- **Max-width do conteúdo**: ~1280px, centrado
- **Padding horizontal**: 24–40px em desktop, 16–20px em mobile
- **Seções**: alternância entre full-bleed e container constrained

### Grid
- 12 colunas em desktop
- Feature sections usam layout assimétrico: texto (~40%) + demo visual (~60%)
- Testimonials em carrossel/grid 1-coluna centrado com max-width estreito (~680px)

### Espaçamento Vertical (escala)
```
4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px, 128px, 160px
```
Seções têm padding vertical de 96–128px. Muito espaço negativo intencional.

---

## 5. Componentes UI

### Navigation
```
[Logo]  [Product ↓]  [Enterprise]  [Pricing]  [Resources ↓]     [Sign in]  [Download]
```
- Sticky, fundo semi-transparente com blur no scroll
- Dropdowns com grid de links categorizados
- CTA "Download" com styling distinto (borda ou fundo sutil)
- Mobile: hamburger → menu fullscreen

### Botões
| Variant   | Estilo                                         |
|-----------|------------------------------------------------|
| Primary   | Fundo `--accent` (off-white quente), texto dark, sem border-radius exagerado (~6px) |
| Secondary | Borda `1px solid --text-muted`, fundo transparente |
| Ghost     | Só texto + arrow `→` ou `↓`                   |
| Icon      | Ícone circular pequeno, sem label              |

**CTAs Hero:**
- "Download for macOS ⤓" → Primary
- "Try mobile agent →" → Ghost/Secondary  
- "Request a demo →" → Ghost

### Cards
- Background `--bg-surface`
- Borda `1px solid` com opacity baixa (~10–15%)
- Border-radius: 8–12px
- Sem sombras agressivas — elevação pelo contraste de background
- Hover: borda levemente mais brilhante, transição suave

### Code Blocks / Terminal
- Background mais escuro que o card (`#0d0b08`)
- Fonte monospace
- Syntax highlighting minimalista: tons de amarelo/laranja quente para strings, azul frio para keywords
- Bordas sem radius excessivo — look "raw" intencional

### Badges / Labels
- "Published" → pill verde pequeno, `#4caf7d` com fundo dark semi-transparente
- "In Progress" → pill amarelo/âmbar
- "Ready for Review" → pill azul sutil

### Testimonials
- Estrutura: bloco de quote (`> texto`) + avatar circular + nome + cargo
- Avatares: fotos reais, 48px, border-radius 50%
- Layout: carrossel horizontal em desktop, sem dots — navegação implícita
- Pessoas: Jensen Huang (NVIDIA), Patrick Collison (Stripe), Andrej Karpathy, shadcn, Greg Brockman, Diana Hu (YC)

---

## 6. Estrutura da Página (Seções)

### 6.1 Hero
- **Headline**: "Built to make you extraordinarily productive, Cursor is the best coding agent."
- **Sub-CTAs**: Download macOS / Try mobile agent / Request a demo
- **Visual**: Demo interativo do produto em vídeo/animação mostrando o IDE, CLI, e agent view
- **Background**: Dark quase total com imagem de fundo de baixo contraste (landscape painterly)

### 6.2 Social Proof Bar
- "Trusted every day by teams that build world-class software"
- Logos de empresas enterprise (sem texto, só logotipos monocromáticos)

### 6.3 Feature: Agents
- **Headline**: "Agents turn ideas into code"
- **Sub**: "Accelerate development by handing off tasks to Cursor, while you focus on making decisions."
- Demo: IDE com painel de planos/tasks visível
- CTA: "Learn about agentic development →"

### 6.4 Feature: Cloud Agents
- **Headline**: "Works autonomously, runs in parallel"
- **Sub**: "Agents use their own computers to build, test, and demo features end to end for you to review."
- Demo: Painel de agentes com task history, status, preview de resultado
- CTA: "Learn about cloud agents →"

### 6.5 Feature: Integrations (CLI + Slack + GitHub)
- **Headline**: "In every tool, at every step"
- **Sub**: "Cursor runs in your terminal, collaborates in Slack, and reviews PRs in GitHub."
- Demo animado: CLI, Slack bot respondendo e abrindo PR
- Comando de instalação: `curl https://cursor.com/install -fsS | bash`

### 6.6 Feature: Tab Autocomplete
- **Headline**: "Magically accurate autocomplete"
- **Sub**: "Our specialized Tab model predicts your next action with striking speed and precision."
- Demo: Editor com sugestões inline aparecendo em tempo real
- Background: Painterly landscape quente

### 6.7 Testimonials
- **Headline**: "The new way to build software."
- Carrossel de quotes de tech leaders
- Layout: centrado, max-width ~780px

### 6.8 Model Picker
- **Headline**: "Stay on the frontier" / "Use the best model for every task"
- Lista visual de modelos: Composer 2.5, GPT-5.5, Opus 4.8, Gemini 3.1 Pro, Grok 4.3
- Selector UI estilo dropdown/pill

### 6.9 Codebase Understanding
- **Headline**: "Complete codebase understanding"
- Screenshot/demo de busca semântica no codebase
- CTA: "Learn about codebase indexing →"

### 6.10 Enterprise
- **Headline**: "Develop enduring software"
- **Sub**: "Trusted by over half of the Fortune 500 to accelerate development, securely and at scale."
- Foto da equipe + prédio (humanizante)
- CTA: "Explore enterprise →"

### 6.11 Changelog
- Lista das últimas versões com data e título
- Layout: tabela/lista linear, sem imagens
- CTA: "See what's new in Cursor →"

### 6.12 About / Careers
- **Headline**: "Cursor is an applied research team focused on building the future of software development."
- Foto da equipe (casual, autentica — não stock)
- CTA: "Join us →"

### 6.13 Blog / Research
- Grid de artigos recentes: data + categoria + título + autor + tempo de leitura
- CTA: "View all blog posts →"

### 6.14 CTA Final
- "Try Cursor now."
- Download + Try mobile agent

### 6.15 Footer
```
Colunas: Product | Resources | Company | Legal | Connect
```
- Links simples, sem ícones (exceto logos sociais)
- Copyright: "© 2026 Anysphere, Inc."
- Badge SOC 2 Certified
- Language switcher (9 idiomas)

---

## 7. Motion & Interatividade

### Princípios
- Animações são **funcionais, não decorativas** — revelam capacidade do produto
- Demos interativos inline (não vídeos estáticos) são o principal veículo de storytelling
- Velocidade de transição: 200–300ms, `ease-out` dominante

### Padrões de Animação
| Elemento              | Animação                                          |
|-----------------------|---------------------------------------------------|
| Scroll reveal         | Fade in + translate Y suave, staggered            |
| Demo do produto       | Loop autoplay ou trigger-on-scroll                |
| Dropdown nav          | Fade + scale-up sutil                             |
| Testimonials          | Slide horizontal ou fade-crossfade                |
| Tab autocomplete demo | Caracteres aparecendo progressivamente (typewriter)|
| Code generation       | Diff highlighting, linhas surgindo uma a uma      |

### Demos Interativos
- São o diferencial do site — não screenshots estáticos
- Mostram UI real do produto funcionando (Desktop, CLI, Slack)
- Background das demos: painterly landscape = warmth, não mais corporate

---

## 8. Imagens & Assets

### Estilo Fotográfico
- Fotos de equipe: naturalistas, não posadas, iluminação ambiente
- Fotos de produto: screenshots diretos do app, sem mockup de device excessivo
- Avatares de testimonials: fotos reais, alta qualidade

### Background Artístico
- Diversas seções usam imagens de fundo painterly (paisagens abstratas quentes)
- Estilo impressionista/digitalizado
- Consistente com o tema `#14120b` — tons de terra, âmbar, verde escuro

### Screenshots de Produto
- UI escura do editor com código real (não lorem ipsum)
- Painel de agentes com tasks plausíveis (nomes realistas de projetos)
- Diferencial: o produto demonstrado é verossímil, não marketing vazio

---

## 9. Responsividade

| Breakpoint | Layout                                               |
|------------|------------------------------------------------------|
| `< 768px`  | Stack vertical, nav colapsa, demos simplificados     |
| `768–1024px`| Grid reduzido, texto menor, demos menores            |
| `> 1024px` | Full layout, demos side-by-side, max-width container |

Mobile-first declarado via `<meta name="viewport" content="width=device-width, initial-scale=1">`.

---

## 10. Acessibilidade & SEO

### Acessibilidade
- "Skip to content" link presente no topo (visível só no focus)
- Demos interativos têm descrição textual explícita para leitores de tela
- Imagens de fundo decorativas tratadas como `aria-hidden`

### SEO / Meta
```
og:title   → "The best coding agent"
og:description → "Built to make you extraordinarily productive..."
og:image   → /public/opengraph-image.png (1200×630)
og:type    → website
twitter:card → summary_large_image
```

---

## 11. Tone of Voice & Copy

| Dimensão     | Característica                                         |
|--------------|--------------------------------------------------------|
| Tom          | Confiante, técnico, direto — quase austero             |
| Pessoa       | 2ª pessoa ("you", "your") — focado no dev              |
| Verbos       | Ativos e fortes: "build", "accelerate", "invent"       |
| Evita        | Buzzwords vazias, superlatives excessivos, emojis      |
| Headlines    | Curtas e assertivas, sem interrogações                 |
| CTAs         | Ação concreta: "Download", "Learn about X →"           |

**Exemplos de copy que funcionam:**
- *"Agents turn ideas into code"* — verbo forte, outcome claro
- *"Works autonomously, runs in parallel"* — técnico, dual benefit
- *"Magically accurate autocomplete"* — único uso de "magically" = intencional por contraste
- *"The new way to build software."* — bold, sem hedging

---

## 12. Diferenciais de Design vs. Concorrentes

| Aspecto              | Cursor                          | Típico SaaS de dev tools          |
|----------------------|---------------------------------|-----------------------------------|
| Background           | `#14120b` warm-dark             | `#000` ou `#fff` stark            |
| Demos                | Interativos, produto real       | Screenshots ou vídeos estáticos   |
| Paleta               | Monocromática quente            | Azul/roxo com gradientes          |
| Testimonials         | Pessoas reais tier-1 (Huang, Collison) | "5 stars from users"        |
| Photography          | Painterly backgrounds           | Stock photos ou nada              |
| Copy                 | Applied research, frontier      | "AI-powered", "10x developer"     |
| Enterprise signal    | Fortune 500 mencionado diretamente | Logos genéricos no footer      |

---

*Referência gerada em Junho 2026 a partir de cursor.com*
