// =====================================================================
//  U LIKE TAILOR — saare MongoDB models ek jagah (require('../models'))
// =====================================================================
//  Embed (ek hi document): shop → members, subscription, automationRules
//                          customer → members (parivar)
//                          order → items (kapde), history
//                          service (garment type) → fields (naap ke khaane)
//                          worker (staff) → capacity
//  Alag collection: measurements, payments, work assignments, fabric entries, messages ...
// =====================================================================
const { LANGS, ORDER_STATUS, TASKS, PAY_MODES, EVENTS } = require('./model.helpers');

module.exports = {
  LANGS, ORDER_STATUS, TASKS, PAY_MODES, EVENTS,
  ...require('./user.model'),
  ...require('./plan.model'),
  ...require('./shop.model'),
  ...require('./subscription.model'),
  ...require('./service.model'),
  ...require('./festival.model'),
  ...require('./message.model'),
  ...require('./design.model'),
  ...require('./customer.model'),
  ...require('./measurement.model'),
  ...require('./order.model'),
  ...require('./payment.model'),
  ...require('./worker.model'),
  ...require('./fabric.model'),
  ...require('./sync.model'),
};
