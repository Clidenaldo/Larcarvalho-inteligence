const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeZone: 'America/Fortaleza',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Fortaleza',
});

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
});

const numberFormatter = new Intl.NumberFormat('pt-BR');
const percentageFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  style: 'percent',
});

export const formatDate = (value: Date | string): string =>
  dateFormatter.format(new Date(value));

export const formatDateTime = (value: Date | string): string =>
  dateTimeFormatter.format(new Date(value));

export const formatBrl = (value: number): string => brlFormatter.format(value);
export const formatNumber = (value: number): string =>
  numberFormatter.format(value);
export const formatPercentage = (value: number): string =>
  percentageFormatter.format(value);

export const formatCnpj = (value: string | null): string => {
  if (!value) return 'Não informado';
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};
