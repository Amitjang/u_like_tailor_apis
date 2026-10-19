// Staff login: maalik apne kisi karigar/staff ko app chalane ka login (mobile + password) deta hai,
// band/chalu karta hai, hata deta hai, aur har staff ki permissions tay karta hai.
// Sab kaam sirf OWNER (routes mein). Staff login wala user sirf usi ek dukaan ka member hota hai.
const { Shop, User, Staff, Session } = require('../models');
const { h, ok, bad, notFound, conflict, limit, requireBody } = require('../utils/http.helpers');
const { normalizePhone } = require('../utils/phone');
const { limitsOf } = require('../utils/plans');
const { hashPassword, passwordOk } = require('../utils/password');
const permissions = require('../utils/permissions');

async function mustStaff(shopId, id) {
  const s = await Staff.findOne({ _id: id, shopId, deletedAt: null }).lean();
  if (!s) throw notFound('staff_not_found');
  return s;
}

const revokeAll = (userId) => Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() }, $unset: { fcmToken: 1 } });

async function view(shopId, staff) {
  const shop = await Shop.findById(shopId).select('members').lean();
  const user = staff.userId ? await User.findById(staff.userId).lean() : null;
  const member = user && (shop.members || []).find((m) => m.userId === user._id);
  const hasAccess = !!(user && member && user.authType === 'password');
  return {
    staffId: staff._id,
    staffName: staff.name,
    suggestedPhone: staff.phone || null, // form mein pehle se bhara (badal sakte hain)
    hasAccess,
    // staff pehle se Google/Apple wale "Team" login se juda hai (tab yahan password nahi banta)
    linkedTeamAccount: !!(user && member && user.authType !== 'password'),
    loginPhone: hasAccess ? user.loginPhone : null,
    isActive: hasAccess ? member.isActive : false,
    memberId: member ? member._id : null,
    role: member ? member.role : 'staff',
    permissions: permissions.effective(member || { role: 'staff' }),
    lastLoginAt: user ? user.lastLoginAt || null : null,
  };
}

// GET /api/workers/:id/access
const getAccess = h(async (req, res) => {
  ok(res, await view(req.shopId, await mustStaff(req.shopId, req.params.id)));
});

// Body: {"phone":"9876543210","password":"abc123","permissions":{...}}
//   naya login: phone + password zaroori. Badalna: phone aur/ya naya password (password reset).
// PUT /api/workers/:id/access
const saveAccess = h(async (req, res) => {
  const b = requireBody(req);
  const staff = await mustStaff(req.shopId, req.params.id);
  const phone = normalizePhone(b.phone);
  if (!phone) throw bad('phone_invalid');
  if (b.password !== undefined && b.password !== '' && !passwordOk(b.password)) throw bad('password_too_short');

  let user = staff.userId ? await User.findById(staff.userId).lean() : null;
  const member = user && req.shop.members.find((m) => m.userId === user._id);
  if (user && member && user.authType !== 'password') throw conflict('staff_has_team_login');
  if (user && user.authType !== 'password') user = null; // purana link (team se hata hua) — naya login banega

  if (await User.exists({ loginPhone: phone, ...(user ? { _id: { $ne: user._id } } : {}) })) throw conflict('login_phone_taken');

  if (!user) {
    if (!passwordOk(b.password)) throw bad('password_required');
    if (!(await limitsOf(req.shop)).multiUser) throw limit('team_needs_pro');
    user = (await User.create({
      name: staff.name, loginPhone: phone, passwordHash: hashPassword(b.password), authType: 'password',
      preferredLanguage: req.shop.defaultLanguage || 'hi', isActive: true,
    })).toObject();
    await Staff.updateOne({ _id: staff._id }, { $set: { userId: user._id } });
  } else {
    const set = { loginPhone: phone, name: user.name || staff.name };
    if (b.password) Object.assign(set, { passwordHash: hashPassword(b.password), failedLogins: 0, lockedUntil: null });
    await User.updateOne({ _id: user._id }, { $set: set });
    if (b.password || phone !== user.loginPhone) await revokeAll(user._id); // naye password / number se dobara login
  }

  const perms = permissions.sanitize(b.permissions);
  const existing = req.shop.members.find((m) => m.userId === user._id);
  if (!existing) {
    await Shop.updateOne({ _id: req.shopId }, { $push: { members: { userId: user._id, role: 'staff', permissions: perms, isActive: true } } });
  } else if (b.permissions !== undefined) {
    await Shop.updateOne({ _id: req.shopId, 'members._id': existing._id }, { $set: { 'members.$.permissions': perms } });
  }
  ok(res, await view(req.shopId, await mustStaff(req.shopId, req.params.id)));
});

// Body: {"isActive":false} — login band (turant logout) / chalu
// PATCH /api/workers/:id/access
const setAccessStatus = h(async (req, res) => {
  const b = requireBody(req);
  if (typeof b.isActive !== 'boolean') throw bad('is_active_required');
  const staff = await mustStaff(req.shopId, req.params.id);
  const member = staff.userId && req.shop.members.find((m) => m.userId === staff.userId);
  if (!member) throw notFound('staff_access_not_found');
  await Shop.updateOne({ _id: req.shopId, 'members._id': member._id }, { $set: { 'members.$.isActive': b.isActive } });
  if (!b.isActive) await revokeAll(staff.userId);
  ok(res, await view(req.shopId, staff));
});

// Staff login poori tarah hatana (record/kaam rehta hai)
// DELETE /api/workers/:id/access
const deleteAccess = h(async (req, res) => {
  const staff = await mustStaff(req.shopId, req.params.id);
  if (!staff.userId) throw notFound('staff_access_not_found');
  const user = await User.findById(staff.userId).lean();
  const member = req.shop.members.find((m) => m.userId === staff.userId);
  if (member && member.role === 'owner') throw bad('cannot_remove_owner');
  await Shop.updateOne({ _id: req.shopId }, { $pull: { members: { userId: staff.userId, role: { $ne: 'owner' } } } });
  await Staff.updateOne({ _id: staff._id }, { $set: { userId: null } });
  await revokeAll(staff.userId);
  // Sirf password wala (maalik ka banaya) account mitta hai; Google/Apple wala account rehta hai
  if (user && user.authType === 'password') await User.deleteOne({ _id: user._id });
  ok(res, { deleted: true, ...(await view(req.shopId, await mustStaff(req.shopId, req.params.id))) });
});

// Permission screen ki list (bhasha mein)
// GET /api/shops/permissions
const getPermissionCatalog = h(async (req, res) => ok(res, { items: permissions.catalog(req.lang) }));

// Body: {"permissions":{"payments":true,"reports":false,...}} — sirf "staff" role par
// PUT /api/shops/team/:memberId/permissions
const setMemberPermissions = h(async (req, res) => {
  const b = requireBody(req);
  const member = req.shop.members.find((m) => m._id === req.params.memberId);
  if (!member) throw notFound('team_member_not_found');
  if (member.role !== 'staff') throw bad('permissions_staff_only');
  const perms = { ...(member.permissions || {}), ...permissions.sanitize(b.permissions) };
  await Shop.updateOne({ _id: req.shopId, 'members._id': member._id }, { $set: { 'members.$.permissions': perms } });
  ok(res, { memberId: member._id, permissions: permissions.effective({ ...member, permissions: perms }) });
});

module.exports = { getAccess, saveAccess, setAccessStatus, deleteAccess, getPermissionCatalog, setMemberPermissions };
