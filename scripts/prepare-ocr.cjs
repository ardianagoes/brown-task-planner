// Copy pinned npm assets into the app's public directory. No CDN/runtime download.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "public", "ocr");
fs.mkdirSync(output, { recursive: true });
const packageRoot = name => path.dirname(require.resolve(name + "/package.json"));
const tess = packageRoot("tesseract.js");
const core = packageRoot("tesseract.js-core");
const eng = packageRoot("@tesseract.js-data/eng");
for (const name of ["tesseract.min.js", "tesseract.min.js.LICENSE.txt", "worker.min.js", "worker.min.js.LICENSE.txt"])
  fs.copyFileSync(path.join(tess, "dist", name), path.join(output, name));
for (const name of fs.readdirSync(core).filter(name => name.endsWith(".wasm.js")))
  fs.copyFileSync(path.join(core, name), path.join(output, name));
fs.copyFileSync(path.join(eng, "4.0.0_best_int", "eng.traineddata.gz"), path.join(output, "eng.traineddata.gz"));
fs.copyFileSync(path.join(tess, "LICENSE.md"), path.join(output, "TESSERACT-LICENSE.txt"));
fs.copyFileSync(path.join(core, "LICENSE"), path.join(output, "CORE-LICENSE.txt"));
fs.writeFileSync(path.join(output, "ASSETS.json"), JSON.stringify({
  tesseract: require(path.join(tess, "package.json")).version,
  core: require(path.join(core, "package.json")).version,
  english: require(path.join(eng, "package.json")).version,
  source: "https://github.com/naptha/tessdata", languageLicense: "Apache-2.0 (Tesseract traineddata)",
}, null, 2) + "\n");
console.log("Prepared local English OCR assets in public/ocr.");
