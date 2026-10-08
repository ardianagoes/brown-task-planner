/* Browser-only controller. Its worker owns the Tesseract worker, allowing
 * timeout/cancel/unmount to terminate the entire OCR job, including startup. */
let running = false;
self.onmessage = async ({ data }) => {
  if (running || !(data?.image instanceof Blob)) return;
  running = true;
  let engine;
  try {
    importScripts("/ocr/tesseract.min.js");
    const asset = name => new URL("/ocr/" + name, self.location.origin).href;
    engine = await Tesseract.createWorker("eng", 1, {
      workerPath: asset("worker.min.js"), corePath: asset(""), langPath: asset(""),
      workerBlobURL: false, gzip: true, cacheMethod: "none",
      logger: message => self.postMessage({ type: "progress", status: message.status, progress: message.progress }),
      errorHandler: () => self.postMessage({ type: "error" }),
    });
    await engine.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO, preserve_interword_spaces: "1" });
    const { data: result } = await engine.recognize(data.image, {}, { text: true });
    self.postMessage({ type: "result", text: result.text, confidence: result.confidence });
  } catch {
    self.postMessage({ type: "error" });
  } finally {
    await engine?.terminate();
    self.close();
  }
};
