import type {
  CalcularIndiceAderenciaRequest,
  Permission,
} from '@larcarvalho/shared';
import type { AuthContext } from '../../core/auth/auth-context.js';
import { hasPermission } from '../../core/auth/rbac.js';
import { AppError } from '../../core/errors/app-error.js';
import type { ComparadorService } from '../comparador/comparador.service.js';
import { calculateIndiceAderencia } from './indice-aderencia.engine.js';

export class IndiceAderenciaService {
  constructor(private readonly comparador: ComparadorService) {}

  private allow(actor: AuthContext, permission: Permission) {
    if (!hasPermission(actor, permission))
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Acesso não autorizado',
        statusCode: 403,
      });
  }

  async calculate(actor: AuthContext, input: CalcularIndiceAderenciaRequest) {
    this.allow(actor, 'indice_aderencia.read');
    const groups = await this.comparador.groupsForEvaluation(
      actor,
      input.grupoIds,
    );
    if (
      input.perfil.categoria &&
      groups.some(
        (group) => group.produto?.categoria !== input.perfil.categoria,
      )
    )
      throw new AppError({
        code: 'COMPARADOR_CONFLICT',
        message: 'Um ou mais grupos não pertencem à categoria do perfil',
        statusCode: 409,
      });
    return {
      perfil: input.perfil,
      resultados: groups.map((group) =>
        calculateIndiceAderencia(input.perfil, group),
      ),
    };
  }
}
