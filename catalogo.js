const skillTypes = {
  linguagem: 'Linguagem',
  sistema: 'Sistema operacional',
  biblioteca: 'Biblioteca ou framework',
  ferramenta: 'Ferramenta ou programa',
  hardware: 'Hardware',
  outros: 'Outros',
};

const projectVisibility = { publico: 'Público', privado: 'Privado' };
const projectStages = {
  andamento: { label: 'Em andamento', description: 'O projeto está em desenvolvimento e ainda tem funcionalidades sendo implementadas.' },
  beta: { label: 'Em beta', description: 'O projeto está em fase de testes e pode receber ajustes antes da versão final.' },
  parcial: { label: 'Parcialmente concluído', description: 'Parte do escopo foi entregue e ainda há itens pendentes.' },
  concluido: { label: 'Concluído', description: 'O escopo previsto para o projeto foi entregue.' },
};

function skillType(skill) {
  if (Object.hasOwn(skillTypes, skill.tipo)) return skill.tipo;
  const category = (skill.categoria ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  if (/^(linguagem|linguagens)\b/.test(category)) return 'linguagem';
  if (/^sistemas?\b/.test(category)) return 'sistema';
  if (/^(bibliotecas?|frameworks?)\b/.test(category)) return 'biblioteca';
  if (/^(ferramentas?|programas?|software|containers?)\b/.test(category)) return 'ferramenta';
  if (/^hardware\b/.test(category)) return 'hardware';
  return 'outros';
}
