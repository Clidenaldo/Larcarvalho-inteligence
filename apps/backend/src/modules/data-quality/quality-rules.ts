export interface QualityFinding {
  code: string;
  entity:
    'Produto' | 'Grupo' | 'Cota' | 'Assembleia' | 'Lance' | 'Contemplacao';
  entityId: string;
  field?: string;
  message: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL';
  administradoraId?: string | undefined;
  produtoId?: string | undefined;
  grupoId?: string | undefined;
}
const finding = (value: QualityFinding): QualityFinding => value;

export function evaluateProduct(record: {
  id: string;
  ativo: boolean;
  administradoraId: string;
  administradora: { ativa: boolean };
}): QualityFinding[] {
  return record.ativo && !record.administradora.ativa
    ? [
        finding({
          code: 'ACTIVE_CHILD_INACTIVE_PARENT',
          entity: 'Produto',
          entityId: record.id,
          field: 'administradoraId',
          message: 'Produto ativo pertence a uma administradora inativa',
          severity: 'WARNING',
          administradoraId: record.administradoraId,
          produtoId: record.id,
        }),
      ]
    : [];
}
export function evaluateGroup(record: {
  id: string;
  status: string;
  administradoraId: string;
  produtoId: string | null;
  administradora: { ativa: boolean };
  produto: { ativo: boolean; administradoraId: string } | null;
}): QualityFinding[] {
  const result: QualityFinding[] = [];
  if (record.status === 'ATIVO' && !record.administradora.ativa)
    result.push(
      finding({
        code: 'ACTIVE_CHILD_INACTIVE_PARENT',
        entity: 'Grupo',
        entityId: record.id,
        field: 'administradoraId',
        message: 'Grupo ativo pertence a uma administradora inativa',
        severity: 'WARNING',
        administradoraId: record.administradoraId,
        produtoId: record.produtoId ?? undefined,
        grupoId: record.id,
      }),
    );
  if (
    record.produto &&
    record.produto.administradoraId !== record.administradoraId
  )
    result.push(
      finding({
        code: 'RELATIONSHIP_MISMATCH',
        entity: 'Grupo',
        entityId: record.id,
        field: 'produtoId',
        message: 'Produto e grupo pertencem a administradoras diferentes',
        severity: 'CRITICAL',
        administradoraId: record.administradoraId,
        produtoId: record.produtoId ?? undefined,
        grupoId: record.id,
      }),
    );
  if (record.status === 'ATIVO' && record.produto && !record.produto.ativo)
    result.push(
      finding({
        code: 'ACTIVE_CHILD_INACTIVE_PARENT',
        entity: 'Grupo',
        entityId: record.id,
        field: 'produtoId',
        message: 'Grupo ativo está associado a um produto inativo',
        severity: 'WARNING',
        administradoraId: record.administradoraId,
        produtoId: record.produtoId ?? undefined,
        grupoId: record.id,
      }),
    );
  return result;
}
export function evaluateQuota(record: {
  id: string;
  status: string;
  prazoRestante: number | null;
  grupoId: string;
  grupo: {
    status: string;
    prazoMeses: number | null;
    administradoraId: string;
    produtoId: string | null;
  };
}): QualityFinding[] {
  const context = {
    administradoraId: record.grupo.administradoraId,
    produtoId: record.grupo.produtoId ?? undefined,
    grupoId: record.grupoId,
  };
  const result: QualityFinding[] = [];
  if (
    record.prazoRestante !== null &&
    record.grupo.prazoMeses !== null &&
    record.prazoRestante > record.grupo.prazoMeses
  )
    result.push(
      finding({
        code: 'REMAINING_TERM_EXCEEDS_GROUP',
        entity: 'Cota',
        entityId: record.id,
        field: 'prazoRestante',
        message: 'Prazo restante da cota excede o prazo total do grupo',
        severity: 'ERROR',
        ...context,
      }),
    );
  if (record.status === 'ATIVO' && record.grupo.status !== 'ATIVO')
    result.push(
      finding({
        code: 'ACTIVE_CHILD_INACTIVE_PARENT',
        entity: 'Cota',
        entityId: record.id,
        field: 'grupoId',
        message: 'Cota ativa pertence a um grupo não ativo',
        severity: 'WARNING',
        ...context,
      }),
    );
  return result;
}
export function evaluateAssembly(
  record: {
    id: string;
    status: string;
    dataAssembleia: Date;
    grupoId: string;
    grupo: { administradoraId: string; produtoId: string | null };
  },
  now: Date,
): QualityFinding[] {
  const context = {
    administradoraId: record.grupo.administradoraId,
    produtoId: record.grupo.produtoId ?? undefined,
    grupoId: record.grupoId,
  };
  if (record.status === 'REALIZADA' && record.dataAssembleia > now)
    return [
      finding({
        code: 'FUTURE_ASSEMBLY_COMPLETED',
        entity: 'Assembleia',
        entityId: record.id,
        field: 'dataAssembleia',
        message: 'Assembleia futura está marcada como realizada',
        severity: 'WARNING',
        ...context,
      }),
    ];
  if (record.status === 'AGENDADA' && record.dataAssembleia < now)
    return [
      finding({
        code: 'PAST_ASSEMBLY_SCHEDULED',
        entity: 'Assembleia',
        entityId: record.id,
        field: 'status',
        message: 'Assembleia passada permanece agendada',
        severity: 'WARNING',
        ...context,
      }),
    ];
  return [];
}
export function evaluateEvent(
  record: {
    id: string;
    cota: { grupoId: string } | null;
    assembleia: {
      grupoId: string;
      grupo: { administradoraId: string; produtoId: string | null };
    };
  },
  entity: 'Lance' | 'Contemplacao',
): QualityFinding[] {
  if (!record.cota || record.cota.grupoId === record.assembleia.grupoId)
    return [];
  return [
    finding({
      code: 'RELATIONSHIP_MISMATCH',
      entity,
      entityId: record.id,
      field: 'cotaId',
      message: `Cota do ${entity.toLowerCase()} pertence a outro grupo`,
      severity: 'CRITICAL',
      administradoraId: record.assembleia.grupo.administradoraId,
      produtoId: record.assembleia.grupo.produtoId ?? undefined,
      grupoId: record.assembleia.grupoId,
    }),
  ];
}
export function evaluateAward(record: {
  id: string;
  tipo: string;
  valorLance: unknown;
  percentualLance: unknown;
  cota: { grupoId: string } | null;
  assembleia: {
    grupoId: string;
    grupo: { administradoraId: string; produtoId: string | null };
  };
}): QualityFinding[] {
  const result = evaluateEvent(record, 'Contemplacao');
  if (
    record.tipo === 'SORTEIO' &&
    (record.valorLance !== null || record.percentualLance !== null)
  )
    result.push(
      finding({
        code: 'SUSPICIOUS_VALUE',
        entity: 'Contemplacao',
        entityId: record.id,
        field: 'valorLance',
        message: 'Contemplação por sorteio possui dados de lance',
        severity: 'WARNING',
        administradoraId: record.assembleia.grupo.administradoraId,
        produtoId: record.assembleia.grupo.produtoId ?? undefined,
        grupoId: record.assembleia.grupoId,
      }),
    );
  return result;
}
export const qualityRuleCatalog = [
  {
    code: 'ACTIVE_CHILD_INACTIVE_PARENT',
    description: 'Registro ativo associado a pai inativo',
    entity: 'Produto/Grupo/Cota',
    severity: 'WARNING',
  },
  {
    code: 'REMAINING_TERM_EXCEEDS_GROUP',
    description: 'Prazo restante maior que o prazo do grupo',
    entity: 'Cota',
    severity: 'ERROR',
  },
  {
    code: 'FUTURE_ASSEMBLY_COMPLETED',
    description: 'Assembleia futura marcada como realizada',
    entity: 'Assembleia',
    severity: 'WARNING',
  },
  {
    code: 'PAST_ASSEMBLY_SCHEDULED',
    description: 'Assembleia passada ainda agendada',
    entity: 'Assembleia',
    severity: 'WARNING',
  },
  {
    code: 'RELATIONSHIP_MISMATCH',
    description:
      'Relacionamento entre administradora, grupo ou cota divergente',
    entity: 'Grupo/Lance/Contemplacao',
    severity: 'CRITICAL',
  },
  {
    code: 'SUSPICIOUS_VALUE',
    description: 'Combinação de valores que merece revisão',
    entity: 'Contemplacao',
    severity: 'WARNING',
  },
] as const;
