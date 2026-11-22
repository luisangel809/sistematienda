export const isFacturaAnulada = (factura) =>
  String(factura?.estado || '').toLowerCase() === 'anulada' ||
  String(factura?.estado_pago || '').toLowerCase() === 'anulada'

export const getAnulacionUpdate = (factura, motivo) => {
  const update = {}

  if (Object.prototype.hasOwnProperty.call(factura, 'estado')) {
    update.estado = 'anulada'
  } else {
    update.estado_pago = 'Anulada'
  }
  if (Object.prototype.hasOwnProperty.call(factura, 'anulada_en')) {
    update.anulada_en = new Date().toISOString()
  }
  if (Object.prototype.hasOwnProperty.call(factura, 'motivo_anulacion')) {
    update.motivo_anulacion = motivo.trim() || null
  }

  return update
}
