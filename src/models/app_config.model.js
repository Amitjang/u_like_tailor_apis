// App ka version / force update / privacy-terms links — server par ek hi document (_id: "main").
// Admin isse badalta hai: PUT /api/admin/app-config. App har baar khulte hi GET /api/public/app-config.
const mongoose = require('mongoose');

const { Schema } = mongoose;
const Platform = new Schema({
  latestVersion: { type: String, default: '1.0.0' }, // store par sabse naya version
  minVersion: { type: String, default: '1.0.0' },    // isse purana = zabardasti update
  storeUrl: { type: String, default: '' },           // Play Store / App Store link
}, { _id: false });

const AppConfig = mongoose.model('AppConfig', new Schema({
  _id: { type: String, default: 'main' },
  android: { type: Platform, default: () => ({}) },
  ios: { type: Platform, default: () => ({}) },
  // true: latestVersion se purani har app ko update karna hi padega
  forceUpdate: { type: Boolean, default: false },
  message: { type: String, default: '' },   // English: is update mein kya naya hai
  messageHi: { type: String, default: '' }, // Hindi
  privacyUrl: { type: String, default: '' },
  termsUrl: { type: String, default: '' },
}, { timestamps: true, versionKey: false }), 'app_config');

module.exports = { AppConfig };
