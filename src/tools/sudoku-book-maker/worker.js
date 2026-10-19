/* Sudoku generation off the main thread. One job at a time: {id, level, seed} -> {id, ok, result | error}. */
importScripts('sudoku-core.js' + (self.location.search || ''));
self.onmessage = function (e) {
  var job = e.data;
  try {
    self.postMessage({ id: job.id, ok: true, result: self.Sudoku.generate(job.level, job.seed) });
  } catch (err) {
    self.postMessage({ id: job.id, ok: false, error: (err && err.message) || String(err) });
  }
};
