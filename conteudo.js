const portfolio = {
  nome: '',
  introducao: 'Um espaço para reunir projetos pessoais, trabalhos da faculdade e o que aprendo construindo cada um deles.',
  sobre: {
    titulo: 'Este é o meu espaço para compartilhar o que construo e aprendo.',
    descricao: 'Aqui entram um pouco da minha trajetória, o que estou estudando e os tipos de projeto que quero desenvolver.',
  },
  redes: {
    linkedin: '', // Ex.: https://www.linkedin.com/in/seu-perfil/
    github: '', // Ex.: https://github.com/seu-usuario
  },
  projetos: [
    {
      titulo: 'Rastreador de hábitos',
      categoria: 'pessoal',
      demonstracao: true,
      resumo: 'Uma interface para registrar hábitos e acompanhar a frequência ao longo da semana.',
      descricao: 'Este conceito reúne um calendário de atividades e um painel semanal. A galeria mostra como a interface poderia exibir os registros do dia e a evolução de cada hábito.',
      tecnologias: ['HTML', 'CSS', 'JavaScript'],
      imagens: [
        { src: './assets/habitos.webp', alt: 'Painel verde-escuro com calendário de atividades e gráfico de evolução.' },
        { src: './assets/habitos-detalhe.webp', alt: 'Visão semanal de hábitos com barras verdes e anéis de progresso.' },
      ],
      repositorio: '',
      demo: '',
    },
    {
      titulo: 'Mapa do campus',
      categoria: 'faculdade',
      demonstracao: true,
      resumo: 'Um protótipo de navegação para encontrar salas, blocos e serviços dentro do campus.',
      descricao: 'A proposta explora como identificar pontos de referência e consultar a localização de salas pelo celular. A imagem ilustra uma tela de mapa com as áreas do campus em destaque.',
      tecnologias: ['Figma', 'Prototipagem'],
      imagens: [
        { src: './assets/campus.webp', alt: 'Celular com um protótipo de mapa do campus em tons de verde.' },
      ],
      repositorio: '',
      demo: '',
    },
    {
      titulo: 'Painel de dados',
      categoria: 'faculdade',
      demonstracao: true,
      resumo: 'Uma exploração de dados com gráficos para comparar tendências e indicadores.',
      descricao: 'A proposta organiza métricas de resumo, séries temporais e comparações em uma mesma tela. A imagem usa dados ilustrativos para mostrar a hierarquia das informações.',
      tecnologias: ['Python', 'Visualização de dados'],
      imagens: [
        { src: './assets/dados.webp', alt: 'Painel azul-petróleo com indicadores, gráfico de linhas e gráfico de barras.' },
      ],
      repositorio: '',
      demo: '',
    },
  ],
};
