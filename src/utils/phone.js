export function formatWhatsAppPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith('1')) return digits
  if (digits.length === 10 || /^(809|829|849)/.test(digits)) return `1${digits}`

  return digits
}
