export function formatDate(date: any): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString()
}

export function formatCurrency(amount: any): string {
  if (!amount) return '$0'
  return `$${Number(amount).toFixed(2)}`
}

export function formatNumber(n: any): string {
  return Number(n).toLocaleString()
}

// Duplicate of processUsers in UserDashboard and processActivity in UserCard
export function processRecords(items: any[]) {
  return items
    .filter((i) => i.active)
    .map((i) => ({ ...i, label: i.name.toUpperCase() }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .reduce((acc: any, i: any) => ({ ...acc, [i.id]: i }), {})
}
