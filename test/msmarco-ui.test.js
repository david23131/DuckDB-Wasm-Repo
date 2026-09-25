import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../src/prebuilt-msmarco.js', () => ({ openPrebuilt: vi.fn(), PREBUILT_NAME: 'msmarco-prebuilt.duckdb' }));
import { openPrebuilt } from '../src/prebuilt-msmarco.js';
import { setupMSMarco } from '../src/msmarco.js';
let elements;
function element() {
  return { disabled: false, hidden: false, value: '', textContent: '', children: [],
    replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); } };
}
beforeEach(() => {
  elements = new Map();
  vi.stubGlobal('document', {
    querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
  });
  vi.stubGlobal('window', { isSecureContext: true });
  vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn() } });
  openPrebuilt.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it('requires opening the saved index, then searches with a bound query and closes the statement', async () => {
  const stmt = { query: vi.fn().mockResolvedValue({ toArray: () => [{ id: '12', contents: '<script>text</script>', score: 3 }] }), close: vi.fn() };
  const conn = { prepare: vi.fn().mockResolvedValue(stmt) };
  openPrebuilt.mockResolvedValue({ conn, count: 8841823, close: vi.fn() });
  setupMSMarco();
  expect(elements.get('#marco-search').disabled).toBe(true);
  await elements.get('#marco-reopen').onclick();
  expect(elements.get('#marco-search').disabled).toBe(false);
  document.querySelector('#marco-query').value = "what's a corporation";
  await elements.get('#marco-form').onsubmit({ preventDefault() {} });
  expect(stmt.query).toHaveBeenCalledWith("what's a corporation");
  expect(stmt.close).toHaveBeenCalledOnce();
  expect(elements.get('#marco-results').children[0].children[1].textContent).toBe('<script>text</script>');
});
it('keeps search disabled and provides download guidance when no saved file exists', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  openPrebuilt.mockRejectedValue(new DOMException('missing', 'NotFoundError'));
  setupMSMarco();
  await elements.get('#marco-reopen').onclick();
  expect(elements.get('#marco-search').disabled).toBe(true);
  expect(elements.get('#marco-reopen').disabled).toBe(false);
  expect(elements.get('#marco-status').textContent).toContain('Download the index first');
});
it('disables all actions on an unsupported browser', () => {
  vi.stubGlobal('navigator', { storage: {} });
  setupMSMarco();
  for (const id of ['#marco-fetch', '#marco-reopen', '#marco-search']) expect(elements.get(id).disabled).toBe(true);
});
it('coordinates with lab actions and releases the saved index on close', async () => {
  const close = vi.fn();
  openPrebuilt.mockResolvedValue({ count: 8841823, close });
  const run = vi.fn(task => task());
  const controller = setupMSMarco(run);
  controller.setBlocked(true);
  await elements.get('#marco-reopen').onclick();
  expect(openPrebuilt).not.toHaveBeenCalled();
  controller.setBlocked(false);
  await elements.get('#marco-reopen').onclick();
  expect(run).toHaveBeenCalledOnce();
  await controller.close();
  expect(close).toHaveBeenCalledOnce();
  expect(elements.get('#marco-search').disabled).toBe(true);
});
