import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type DefaultValues, type FieldValues, type Path, type Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';
import { ErroApi } from './api';

/**
 * Formulário com React Hook Form validado pelo mesmo esquema Zod do servidor (contratos/), então a mensagem é a
 * mesma nas duas pontas. `aplicarErro` joga os erros de campo do servidor nos campos e o resto em `root.servidor`.
 */
export function useFormulario<T extends FieldValues>(esquema: ZodType, valoresIniciais: DefaultValues<T>) {
  const form = useForm<T>({
    resolver: zodResolver(esquema as never) as unknown as Resolver<T>,
    defaultValues: valoresIniciais,
  });

  const aplicarErro = (erro: unknown) => {
    if (erro instanceof ErroApi && erro.campos) {
      for (const [campo, mensagem] of Object.entries(erro.campos)) {
        form.setError(campo as Path<T>, { message: mensagem });
      }
      return;
    }
    form.setError('root.servidor', { message: erro instanceof Error ? erro.message : 'Algo deu errado.' });
  };

  const erroDoServidor = form.formState.errors.root?.servidor?.message;
  return { ...form, aplicarErro, erroDoServidor };
}

/** Mensagem de erro de um campo, vinda da validação local ou do servidor. */
export function erroDoCampo<T extends FieldValues>(
  erros: ReturnType<typeof useForm<T>>['formState']['errors'],
  campo: Path<T>,
): string | undefined {
  const erro = (erros as Record<string, { message?: unknown } | undefined>)[campo];
  return typeof erro?.message === 'string' ? erro.message : undefined;
}
