// Privacy Policy, Terms, Account delete aur Contact ke web pages (bina login).
// App ke "Terms / Privacy" link aur Play Store / App Store isi ko kholte hain:
//   /privacy  /terms  /delete-account  /contact
const express = require("express");
const path = require("path");

const router = express.Router();
const dir = path.join(__dirname, "..", "legal");
const PAGES = { privacy: "privacy.html", terms: "terms.html", "delete-account": "delete-account.html", contact: "contact.html" };

const send = (file, type) => (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.type(type).sendFile(path.join(dir, file));
};

for (const [route, file] of Object.entries(PAGES)) {
  router.get(`/${route}`, send(file, "html"));
}
router.get("/legal.css", send("legal.css", "css"));

module.exports = router;
