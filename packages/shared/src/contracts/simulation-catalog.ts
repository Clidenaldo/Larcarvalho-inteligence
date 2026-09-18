import { z } from 'zod';
const product = z.object({ id: z.uuid(), nome: z.string(), categoria: z.string() });
const group = z.object({ id: z.uuid(), codigo: z.string(), produto: product.nullable() });
export const simulationCatalogSchema = z.object({
  administrators: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  products: z.array(product), groups: z.array(group),
  quotas: z.array(z.object({ id: z.uuid(), numero: z.string(), grupo: group })),
});
export type SimulationCatalog = z.infer<typeof simulationCatalogSchema>;
