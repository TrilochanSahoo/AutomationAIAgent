export function logWithIcon(type, message) {
  const icons = {
    info: "ℹ️ ",
    success: "✅ ",
    error: "❌ ",
    warning: "⚠️ ",
    agent: "🤖 ",
    user: "👤 ",
  };

  console.log(`${icons[type] || ""}${message}`);
}