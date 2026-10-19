// Login: Google / Apple, phone jodna (OTP), token refresh, logout, profile, push token
// Mount: /api/auth  —  /google, /apple, /otp/* aur /refresh bina login; baaki login zaroori (route par)
const express = require("express");
const { requireAuth } = require("../middleware");
const authController = require("../controller/auth.controller");

const router = express.Router();

router.post("/google", authController.googleLogin);
router.post("/apple", authController.appleLogin);
router.post("/staff-login", authController.staffLogin); // maalik ka banaya mobile + password
router.post("/change-password", requireAuth, authController.changePassword);
router.post("/phone/send-otp", requireAuth, authController.sendPhoneOtp);
router.post("/phone/verify", requireAuth, authController.verifyPhone);
router.post("/fcm-token", requireAuth, authController.updateFcmToken);
router.post("/otp/send", authController.sendOtp); // purana phone login
router.post("/otp/verify", authController.verifyOtp);
router.post("/refresh", authController.refreshToken);
router.post("/logout", requireAuth, authController.logout);
router.get("/me", requireAuth, authController.getProfile);
router.patch("/me", requireAuth, authController.updateProfile);

module.exports = router;
