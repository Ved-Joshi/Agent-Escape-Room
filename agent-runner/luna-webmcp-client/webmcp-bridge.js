(() => {
  if (globalThis.__lunaWebMCPBridgeInstalled) return;
  globalThis.__lunaWebMCPBridgeInstalled = true;
  globalThis.__lunaWebMCPRegistry = new Map();

  let attempts = 0;
  const install = () => {
    attempts += 1;
    const context = document.modelContext;
    if (!context?.registerTool) {
      if (attempts < 1000) setTimeout(install, 10);
      return;
    }
    if (context.registerTool.__lunaWrapped) return;
    const original = context.registerTool.bind(context);
    const wrapped = async (tool, options) => {
      const result = await original(tool, options);
      globalThis.__lunaWebMCPRegistry.set(tool.name, tool);
      return result;
    };
    Object.defineProperty(wrapped, "__lunaWrapped", { value: true });
    context.registerTool = wrapped;
  };
  install();
})();
