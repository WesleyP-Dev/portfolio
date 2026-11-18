# Portfólio

Site estático em HTML, CSS e JavaScript, com temas claro e escuro, filtros de projetos e galeria navegável por teclado. Para abrir, clique duas vezes em `index.html` ou use um servidor local na raiz do projeto.

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8000/` no navegador. Use `Ctrl+C` no terminal para encerrar o servidor.

## Personalize em `conteudo.js`

- Preencha `nome`, `introducao` e `sobre` com seus dados.
- Cole os endereços completos dos seus perfis em `redes.linkedin` e `redes.github`. O site ativa cada link quando o respectivo endereço é preenchido.
- Substitua os projetos de exemplo por projetos reais. Use `categoria: 'pessoal'` ou `categoria: 'faculdade'`, escreva um `resumo` curto e conte o que você fez em `descricao`. Defina `demonstracao: false` para seus projetos reais.
- Coloque as imagens em `assets/` e adicione entradas `{ src: './assets/arquivo.webp', alt: 'Descrição da imagem' }` em `imagens`. Duas ou mais imagens ativam o carrossel. Use `[]` para exibir um projeto sem imagens.
- Preencha `repositorio` e `demo` quando tiver links públicos para o código e a demonstração. Esses links aparecem em **Ver detalhes**.
- Em `tecnologias`, acrescente linguagens, bibliotecas, hardware, sistemas ou ferramentas. Use `categoria` para indicar o tipo e preencha `experiencia` com uma aplicação concreta, como `Usei para criar um ambiente local do projeto X`. Para novos ícones, use `imagem: './assets/meu-icone.png'`. Sem uma imagem ou um `icone` conhecido, o cartão exibe um símbolo genérico.

## Versões no Git

O histórico local começa em `v0.1.0` com a base do portfólio e `v0.2.0` com a seção de tecnologias e o guia de publicação. Os commits guardam as mudanças na mesma pasta.

```powershell
git log --oneline --decorate
git diff v0.1.0 v0.2.0
git status --short
```

Para enviar a primeira versão, crie um repositório vazio no GitHub e substitua `SEU-USUARIO` pelo seu usuário e `portfolio` pelo nome do repositório, se for diferente.

```powershell
git remote add origin https://github.com/SEU-USUARIO/portfolio.git
git push -u origin main
git push origin --tags
```

Para registrar uma mudança posterior de conteúdo, revise o diff, adicione os arquivos alterados e faça um commit. Você pode marcar uma nova versão quando fechar um conjunto de mudanças.

```powershell
git diff
git add -- conteudo.js assets
git commit -m "Atualiza os projetos do portfólio"
git tag -a v0.3.0 -m "Novos projetos"
git push
git push origin v0.3.0
```

## Hospedagem

**GitHub Pages.** No GitHub, abra **Settings → Pages**. Selecione **Deploy from a branch**, escolha `main` e `/(root)` e salve. Os caminhos dos arquivos são relativos e funcionam no subdiretório de um repositório. [Guia oficial do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

**Google Cloud com Firebase Hosting.** Crie um projeto Firebase ou adicione Firebase ao seu projeto do Google Cloud. Com a Firebase CLI instalada e autenticada, prepare uma pasta de publicação a partir da raiz do projeto.

```powershell
New-Item -ItemType Directory -Force public | Out-Null
Copy-Item -Path index.html,styles.css,conteudo.js,script.js -Destination public -Force
Copy-Item -Path assets -Destination public -Recurse -Force
firebase init hosting
```

Selecione o projeto, informe `public` como diretório público, responda **Não** à configuração de aplicativo de página única, preserve seu `index.html` e deixe a integração automática com GitHub para quando quiser configurá-la. Caso a CLI solicite, crie o site padrão do Hosting. Execute `firebase deploy --only hosting` para publicar. Atualize a pasta `public` a cada publicação em que alterar os arquivos do site. [Guia do Firebase Hosting](https://firebase.google.com/docs/hosting/quickstart) e [criação do site padrão](https://firebase.google.com/docs/hosting/default-site).

## Imagens

O [diretório `assets`](assets/) contém imagens ilustrativas geradas com o ImageGen integrado e otimizadas em WebP. Os conceitos usados nos prompts foram:

- `hero.webp` — fita tridimensional de filamentos verde-lima em fundo verde-escuro com grade sutil, sem texto ou pessoas.
- `habitos.webp` — painel verde-escuro de hábitos, com calendário de atividades e gráfico de tendência.
- `habitos-detalhe.webp` — visão semanal do painel de hábitos, com barras e anéis de progresso.
- `campus.webp` — celular com um protótipo de mapa do campus em tons de menta e oliva.
- `dados.webp` — painel azul-petróleo com métricas e gráficos de linhas e barras.
