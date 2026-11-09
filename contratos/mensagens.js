import { z } from 'zod';

// Mensagens do Zod em português, para tudo que um contrato não diz com texto próprio.
// Os contratos ficam em contratos/ e servem ao servidor e ao front; cada arquivo que usa o Zod importa
// este módulo, então as duas pontas devolvem exatamente o mesmo texto.

const TIPOS = {
  string: 'texto',
  number: 'número',
  int: 'número inteiro',
  boolean: 'verdadeiro ou falso',
  array: 'lista',
  object: 'objeto',
  date: 'data',
  bigint: 'número inteiro',
};

function plural(n, singular, pluralTexto) {
  return `${n} ${Number(n) === 1 ? singular : pluralTexto}`;
}

function medida(origem, n) {
  if (origem === 'string') return plural(n, 'caractere', 'caracteres');
  if (origem === 'array' || origem === 'set') return plural(n, 'item', 'itens');
  return String(n);
}

/** Texto em português para um problema de validação do Zod. */
export function mensagemPadrao(problema) {
  switch (problema.code) {
    case 'invalid_type':
      if (problema.input === undefined || problema.input === null) return 'Campo obrigatório.';
      return `Valor inválido: informe ${TIPOS[problema.expected] ? `um(a) ${TIPOS[problema.expected]}` : 'o tipo certo'}.`;
    case 'too_small':
      if (problema.origin === 'string' && Number(problema.minimum) === 1) return 'Campo obrigatório.';
      if (problema.origin === 'string' || problema.origin === 'array' || problema.origin === 'set') {
        return `Informe pelo menos ${medida(problema.origin, problema.minimum)}.`;
      }
      return problema.inclusive === false
        ? `O valor deve ser maior que ${problema.minimum}.`
        : `O valor mínimo é ${problema.minimum}.`;
    case 'too_big':
      if (problema.origin === 'string' || problema.origin === 'array' || problema.origin === 'set') {
        return `Informe no máximo ${medida(problema.origin, problema.maximum)}.`;
      }
      return problema.inclusive === false
        ? `O valor deve ser menor que ${problema.maximum}.`
        : `O valor máximo é ${problema.maximum}.`;
    case 'invalid_format':
      return problema.format === 'email' ? 'E-mail inválido.' : 'Formato inválido.';
    case 'invalid_value':
      return 'Escolha uma opção válida.';
    case 'not_multiple_of':
      return `O valor deve ser múltiplo de ${problema.divisor}.`;
    case 'unrecognized_keys':
      return 'Campo não reconhecido.';
    default:
      return 'Valor inválido.';
  }
}

z.config({ customError: mensagemPadrao });
