// Shuruaati data: plans, system ke kapde (naap ke khaanon ke saath), WhatsApp templates (hi + en).
// Server start hote hi apne aap chalta hai. Sirf jo nahi hai wahi jodta hai —
// admin ki badli hui keemat ya dukaan ke apne templates kabhi overwrite nahi hote.
//   Alag se chalana:  npm run seed
const { Plan, GarmentType, MessageTemplate } = require('../models');

const growthLimits = { maxCustomers: 1000, maxOrdersPerMonth: 800, maxStaff: 5, whatsappAutomation: true, voiceInput: true, reports: true };
const proLimits = { maxCustomers: null, maxOrdersPerMonth: null, maxStaff: null, whatsappAutomation: true, voiceInput: true, reports: true, gstInvoice: true, multiUser: true };

const PLANS = [
  { code: 'free', tier: 'free', name: 'Free', nameHi: 'मुफ़्त', pricePaise: 0, billingPeriod: 'monthly', sortOrder: 1,
    description: 'For small tailors: customers, measurements and orders', descriptionHi: 'छोटे दर्ज़ियों के लिए: ग्राहक, नाप और ऑर्डर',
    limits: { maxCustomers: 100, maxOrdersPerMonth: 100, maxStaff: 1, whatsappAutomation: false, voiceInput: true, reports: false } },
  { code: 'growth', tier: 'growth', name: 'Growth', nameHi: 'ग्रोथ', pricePaise: 14900, billingPeriod: 'monthly', sortOrder: 2,
    description: 'For growing shops: WhatsApp automation and reports', descriptionHi: 'बढ़ती दुकानों के लिए: WhatsApp ऑटोमेशन और रिपोर्ट', limits: growthLimits },
  { code: 'pro', tier: 'pro', name: 'Pro', nameHi: 'प्रो', pricePaise: 29900, billingPeriod: 'monthly', sortOrder: 3,
    description: 'For big shops: unlimited, team access and GST bills', descriptionHi: 'बड़ी दुकानों के लिए: अनलिमिटेड, टीम एक्सेस और GST बिल', limits: proLimits },
  { code: 'growth_yearly', tier: 'growth', name: 'Growth (Yearly)', nameHi: 'ग्रोथ (सालाना)', pricePaise: 149000, billingPeriod: 'yearly', sortOrder: 4,
    description: 'Growth for a year — 2 months free', descriptionHi: 'ग्रोथ पूरे साल के लिए — 2 महीने मुफ़्त', limits: growthLimits },
  { code: 'pro_yearly', tier: 'pro', name: 'Pro (Yearly)', nameHi: 'प्रो (सालाना)', pricePaise: 299000, billingPeriod: 'yearly', sortOrder: 5,
    description: 'Pro for a year — 2 months free', descriptionHi: 'प्रो पूरे साल के लिए — 2 महीने मुफ़्त', limits: proLimits },
];

// [key, label, labelHi, aliases, min, max, required]
const F = (key, label, labelHi, aliases, minValue, maxValue, isRequired = false) => ({ key, label, labelHi, voiceAliases: aliases, minValue, maxValue, isRequired });
const length = (min, max) => F('length', 'Length', 'लंबाई', ['length', 'lambai', 'lambaai', 'लंबाई', 'लम्बाई'], min, max, true);
const chest = F('chest', 'Chest', 'छाती', ['chest', 'chhati', 'chati', 'seena', 'सीना', 'छाती', 'bust'], 20, 60, true);
const waist = F('waist', 'Waist', 'कमर', ['waist', 'kamar', 'कमर'], 18, 60);
const hip = F('hip', 'Hip', 'हिप', ['hip', 'hips', 'seat', 'हिप', 'सीट'], 20, 65);
const shoulder = F('shoulder', 'Shoulder', 'कंधा', ['shoulder', 'kandha', 'tira', 'कंधा', 'तीरा'], 10, 25, true);
const sleeve = F('sleeve', 'Sleeve', 'बाजू', ['sleeve', 'baju', 'bah', 'baah', 'बाजू', 'बांह', 'बाँह'], 5, 30, true);
const neck = F('neck', 'Neck', 'गला', ['neck', 'gala', 'collar', 'गला', 'कॉलर'], 10, 22);
const bottom = F('bottom', 'Bottom (Mohri)', 'मोहरी', ['bottom', 'mohri', 'mori', 'मोहरी'], 5, 30);

const GARMENTS = [
  { code: 'shirt', name: 'Shirt', nameHi: 'शर्ट', gender: 'male', defaultDays: 5, sortOrder: 1,
    fields: [length(20, 40), chest, waist, hip, shoulder, sleeve, neck,
      F('cuff', 'Cuff', 'कफ', ['cuff', 'kaf', 'कफ'], 6, 14)] },
  { code: 'pant', name: 'Pant', nameHi: 'पैंट', gender: 'male', defaultDays: 5, sortOrder: 2,
    fields: [length(30, 48), waist, hip,
      F('thigh', 'Thigh', 'जांघ', ['thigh', 'jangh', 'jaangh', 'जांघ', 'जाँघ'], 14, 40),
      F('knee', 'Knee', 'घुटना', ['knee', 'ghutna', 'घुटना'], 10, 30), bottom] },
  { code: 'kurta', name: 'Kurta', nameHi: 'कुर्ता', gender: 'unisex', defaultDays: 6, sortOrder: 3,
    fields: [length(20, 60), chest, waist, hip, shoulder, sleeve, neck] },
  { code: 'blouse', name: 'Blouse', nameHi: 'ब्लाउज़', gender: 'female', defaultDays: 5, sortOrder: 4,
    fields: [length(10, 24), chest, waist, shoulder,
      F('sleeve', 'Sleeve', 'बाजू', ['sleeve', 'baju', 'bah', 'बाजू', 'बांह'], 3, 24, true),
      F('armhole', 'Armhole', 'मुड्ढा', ['armhole', 'mudda', 'muddha', 'मुड्ढा'], 12, 24),
      F('front_neck', 'Front neck depth', 'आगे का गला', ['front neck', 'aage gala', 'आगे'], 3, 12),
      F('back_neck', 'Back neck depth', 'पीछे का गला', ['back neck', 'peeche gala', 'पीछे'], 3, 14)] },
  { code: 'salwar_suit', name: 'Salwar Suit', nameHi: 'सलवार सूट', gender: 'female', defaultDays: 7, sortOrder: 5,
    fields: [length(30, 50), chest, waist, hip, shoulder, sleeve,
      F('salwar_length', 'Salwar length', 'सलवार की लंबाई', ['salwar', 'salwar length', 'सलवार'], 30, 48), bottom] },
].map((g) => ({ ...g, fields: g.fields.map((f, i) => ({ ...f, sortOrder: i + 1 })) }));

const T = (event, language, body) => ({ event, language, body });
const TEMPLATES = [
  T('order_received', 'hi', 'नमस्ते {{customer_name}} जी 🙏\n{{shop_name}} में आपका ऑर्डर #{{order_number}} मिल गया है।\nकपड़े: {{garments}}\nडिलीवरी: {{delivery_date}}\nकुल: ₹{{total}} | जमा: ₹{{paid}} | बाकी: ₹{{balance}}\nऑर्डर का स्टेटस यहाँ देखें: {{tracking_link}}'),
  T('trial_reminder', 'hi', 'नमस्ते {{customer_name}} जी, {{trial_date}} को आपके ऑर्डर #{{order_number}} का ट्रायल है। कृपया {{shop_name}} पर आएँ। 🙏'),
  T('order_ready', 'hi', 'खुशखबरी {{customer_name}} जी! 🎉\nआपका ऑर्डर #{{order_number}} ({{garments}}) तैयार है।\nबाकी: ₹{{balance}}\nकभी भी ले जाएँ। — {{shop_name}}\n{{tracking_link}}'),
  T('delivery_reminder', 'hi', 'नमस्ते {{customer_name}} जी, आपका ऑर्डर #{{order_number}} {{delivery_date}} को तैयार हो जाएगा। — {{shop_name}}'),
  T('payment_due', 'hi', 'नमस्ते {{customer_name}} जी, ऑर्डर #{{order_number}} का ₹{{balance}} बाकी है।\nऑनलाइन भुगतान के लिए: {{tracking_link}}\n— {{shop_name}}'),
  T('payment_received', 'hi', 'धन्यवाद {{customer_name}} जी! 🙏 ₹{{amount}} मिल गए।\nअब बाकी: ₹{{balance}}\n— {{shop_name}}'),
  T('birthday', 'hi', 'जन्मदिन की ढेर सारी शुभकामनाएँ {{customer_name}} जी! 🎂\n— {{shop_name}}'),
  T('anniversary', 'hi', 'शादी की सालगिरह की हार्दिक बधाई {{customer_name}} जी! 💐\n— {{shop_name}}'),
  T('custom', 'hi', '{{message}}\n— {{shop_name}}'),
  T('order_received', 'en', 'Hello {{customer_name}} 🙏\nYour order #{{order_number}} has been received at {{shop_name}}.\nItems: {{garments}}\nDelivery: {{delivery_date}}\nTotal: ₹{{total}} | Paid: ₹{{paid}} | Balance: ₹{{balance}}\nTrack your order: {{tracking_link}}'),
  T('trial_reminder', 'en', 'Hello {{customer_name}}, the trial for your order #{{order_number}} is on {{trial_date}}. Please visit {{shop_name}}. 🙏'),
  T('order_ready', 'en', 'Good news {{customer_name}}! 🎉\nYour order #{{order_number}} ({{garments}}) is ready.\nBalance: ₹{{balance}}\nPick it up anytime. — {{shop_name}}\n{{tracking_link}}'),
  T('delivery_reminder', 'en', 'Hello {{customer_name}}, your order #{{order_number}} will be ready on {{delivery_date}}. — {{shop_name}}'),
  T('payment_due', 'en', 'Hello {{customer_name}}, ₹{{balance}} is pending for order #{{order_number}}.\nPay online: {{tracking_link}}\n— {{shop_name}}'),
  T('payment_received', 'en', 'Thank you {{customer_name}}! 🙏 We received ₹{{amount}}.\nBalance now: ₹{{balance}}\n— {{shop_name}}'),
  T('birthday', 'en', 'Happy birthday {{customer_name}}! 🎂\n— {{shop_name}}'),
  T('anniversary', 'en', 'Happy anniversary {{customer_name}}! 💐\n— {{shop_name}}'),
  T('custom', 'en', '{{message}}\n— {{shop_name}}'),
];

const { templateVars } = require('./template');

// Sirf naya ho to daalo; maujood document ko chhuo bhi mat (timestamps: false)
const ONLY_INSERT = { upsert: true, timestamps: false };
const stamp = () => ({ createdAt: new Date(), updatedAt: new Date() });

async function seed() {
  for (const p of PLANS) {
    await Plan.updateOne({ code: p.code }, { $setOnInsert: { ...p, ...stamp() } }, ONLY_INSERT);
  }
  for (const g of GARMENTS) {
    await GarmentType.updateOne({ shopId: null, code: g.code, deletedAt: null },
      { $setOnInsert: { ...g, shopId: null, ...stamp() } }, ONLY_INSERT);
  }
  for (const t of TEMPLATES) {
    await MessageTemplate.updateOne({ shopId: null, event: t.event, language: t.language, deletedAt: null },
      { $setOnInsert: { ...t, shopId: null, variables: templateVars(t.body), ...stamp() } }, ONLY_INSERT);
  }
}

module.exports = { seed, PLANS, GARMENTS, TEMPLATES };

if (require.main === module) {
  const mongoose = require('mongoose');
  const connectDB = require('../config/db');
  connectDB()
    .then(seed)
    .then(() => { console.log('Seed ho gaya ✓'); return mongoose.disconnect(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
