import "./styles.css";

const root = document.getElementById("stage")!;
const loading = document.getElementById("loading")!;

try {
  // The physics engine (WASM) loads with the app module.
  const { App } = await import("./app/App");
  const app = new App(root);
  loading.remove();
  app.start();
} catch (error: unknown) {
  loading.remove();
  const { mountError } = await import("./app/App").catch(() => ({ mountError: undefined }));
  if (mountError) mountError(document.getElementById("frame")!, error);
  else document.getElementById("frame")!.textContent = `加载失败：${String(error)}`;
}
